import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignRunStatus,
  CampaignStatus,
  ConsentStatus,
  Prisma,
  RecipientStatus,
} from '@prisma/client';
import { QueueService } from '../../queue/queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './campaigns.dto';
import { validateCampaignTemplate } from './campaign-policy';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  list(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      include: {
        template: { select: { name: true, language: true, category: true, status: true } },
        runs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, createdByUserId: string, dto: CreateCampaignDto) {
    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: dto.templateId, organizationId },
    });
    if (!template) throw new NotFoundException('Template não encontrado.');
    return this.prisma.campaign.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        templateId: dto.templateId,
        segmentId: dto.segmentId,
        ...(dto.templateParameters !== undefined
          ? { templateParameters: dto.templateParameters as Prisma.InputJsonValue }
          : {}),
        scheduledAt: dto.scheduledAt,
        status: dto.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        createdByUserId,
      },
      include: { template: true },
    });
  }

  async validate(organizationId: string, campaignId: string) {
    const campaign = await this.findOrThrow(organizationId, campaignId);
    const errors = validateCampaignTemplate(campaign.template);
    const eligibleRecipients = await this.eligibleContactsCount(organizationId);
    if (eligibleRecipients === 0) errors.push('Não existem contatos com opt-in elegíveis para envio.');
    return {
      valid: errors.length === 0,
      errors,
      eligibleRecipients,
      warnings: ['O custo exibido será estimado até a confirmação dos webhooks de pricing da Meta.'],
    };
  }

  async start(organizationId: string, campaignId: string, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException('Envie um cabeçalho Idempotency-Key válido.');
    }
    const existing = await this.prisma.campaignRun.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const campaign = await this.findOrThrow(organizationId, campaignId);
    const errors = validateCampaignTemplate(campaign.template);
    if (errors.length) throw new BadRequestException(errors);
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED &&
      campaign.status !== CampaignStatus.PAUSED &&
      campaign.status !== CampaignStatus.FAILED
    ) {
      throw new ConflictException(`A campanha não pode ser iniciada no estado ${campaign.status}.`);
    }

    const contacts = await this.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        marketingStatus: ConsentStatus.OPTED_IN,
        suppressions: { none: { liftedAt: null } },
      },
      select: { id: true },
    });
    if (!contacts.length) throw new BadRequestException('Não existem contatos elegíveis para esta campanha.');

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaignRun.create({
        data: {
          campaignId,
          idempotencyKey,
          status: CampaignRunStatus.PROCESSING,
          totalRecipients: contacts.length,
          startedAt: new Date(),
        },
      });
      await tx.campaignRecipient.createMany({
        data: contacts.map((contact: { id: string }) => ({
          campaignRunId: created.id,
          contactId: contact.id,
          status: RecipientStatus.PENDING,
        })),
        skipDuplicates: true,
      });
      await tx.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PROCESSING } });
      return created;
    });

    await this.enqueueRun(organizationId, run.id);
    return run;
  }

  async pause(organizationId: string, campaignId: string) {
    await this.findOrThrow(organizationId, campaignId);
    return this.prisma.$transaction([
      this.prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PAUSED } }),
      this.prisma.campaignRun.updateMany({
        where: { campaignId, status: CampaignRunStatus.PROCESSING },
        data: { status: CampaignRunStatus.PAUSED },
      }),
    ]);
  }

  async resume(organizationId: string, campaignId: string) {
    await this.findOrThrow(organizationId, campaignId);
    const runs = await this.prisma.campaignRun.findMany({
      where: { campaignId, status: CampaignRunStatus.PAUSED },
    });
    await this.prisma.$transaction([
      this.prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PROCESSING } }),
      this.prisma.campaignRun.updateMany({
        where: { campaignId, status: CampaignRunStatus.PAUSED },
        data: { status: CampaignRunStatus.PROCESSING },
      }),
    ]);
    for (const run of runs) await this.enqueueRun(organizationId, run.id);
    return { resumedRuns: runs.length };
  }

  async cancel(organizationId: string, campaignId: string) {
    await this.findOrThrow(organizationId, campaignId);
    return this.prisma.$transaction([
      this.prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.CANCELED } }),
      this.prisma.campaignRun.updateMany({
        where: { campaignId, status: { in: [CampaignRunStatus.PROCESSING, CampaignRunStatus.PAUSED, CampaignRunStatus.PREPARING] } },
        data: { status: CampaignRunStatus.CANCELED, completedAt: new Date() },
      }),
      this.prisma.campaignRecipient.updateMany({
        where: {
          campaignRun: { campaignId },
          status: { in: [RecipientStatus.PENDING, RecipientStatus.QUEUED] },
        },
        data: { status: RecipientStatus.CANCELED },
      }),
    ]);
  }

  private enqueueRun(organizationId: string, campaignRunId: string) {
    return this.queues.campaignDispatch.add(
      'dispatch',
      { organizationId, campaignRunId },
      {
        jobId: `dispatch:${campaignRunId}:${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400, count: 5000 },
        removeOnFail: { age: 604_800, count: 5000 },
      },
    );
  }

  private eligibleContactsCount(organizationId: string) {
    return this.prisma.contact.count({
      where: {
        organizationId,
        deletedAt: null,
        marketingStatus: ConsentStatus.OPTED_IN,
        suppressions: { none: { liftedAt: null } },
      },
    });
  }

  private async findOrThrow(organizationId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { template: true },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');
    return campaign;
  }
}
