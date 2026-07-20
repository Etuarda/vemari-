import {
  CampaignRunStatus,
  CampaignStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  RecipientStatus,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import {
  CampaignDispatchJob,
  OutboundJob,
  QUEUE_NAMES,
} from '@vemari/contracts';
import { appConfig } from '../../shared/config';
import { prisma, redis } from '../lib/runtime';

export async function processCampaignDispatch(job: Job<CampaignDispatchJob>) {
  const run = await prisma.campaignRun.findFirst({
    where: { id: job.data.campaignRunId, campaign: { organizationId: job.data.organizationId } },
    include: { campaign: true },
  });
  if (!run || run.status !== CampaignRunStatus.PROCESSING) return;

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignRunId: run.id, status: RecipientStatus.PENDING },
    take: appConfig.CAMPAIGN_BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
  });
  const outbound = new Queue<OutboundJob>(QUEUE_NAMES.WHATSAPP_OUTBOUND, { connection: redis });

  for (const recipient of recipients) {
    const claimed = await prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: RecipientStatus.PENDING },
      data: { status: RecipientStatus.QUEUED },
    });
    if (claimed.count !== 1) continue;
    await outbound.add(
      'marketing-template',
      {
        kind: 'MARKETING_TEMPLATE',
        organizationId: job.data.organizationId,
        campaignRecipientId: recipient.id,
      },
      {
        jobId: `recipient:${recipient.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400, count: 50_000 },
        removeOnFail: { age: 604_800, count: 50_000 },
      },
    );
  }

  const pending = await prisma.campaignRecipient.count({
    where: { campaignRunId: run.id, status: RecipientStatus.PENDING },
  });
  if (pending > 0) {
    const dispatchQueue = new Queue<CampaignDispatchJob>(QUEUE_NAMES.CAMPAIGN_DISPATCH, { connection: redis });
    await dispatchQueue.add('dispatch', job.data, {
      jobId: `dispatch:${run.id}:${Date.now()}`,
      delay: 250,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
    });
    await dispatchQueue.close();
  } else {
    const open = await prisma.campaignRecipient.count({
      where: {
        campaignRunId: run.id,
        status: { in: [RecipientStatus.PENDING, RecipientStatus.QUEUED] },
      },
    });
    if (open === 0) {
      await prisma.$transaction([
        prisma.campaignRun.update({
          where: { id: run.id },
          data: { status: CampaignRunStatus.COMPLETED, completedAt: new Date() },
        }),
        prisma.campaign.update({
          where: { id: run.campaignId },
          data: { status: CampaignStatus.COMPLETED },
        }),
      ]);
    }
  }
  await outbound.close();
}

export function resolveText(value: string, contact: { name: string; phoneE164: string; email: string | null }): string {
  return value
    .replaceAll('{{contact.name}}', contact.name)
    .replaceAll('{{contact.phone}}', contact.phoneE164)
    .replaceAll('{{contact.email}}', contact.email ?? '');
}

export function buildTemplateComponents(parameters: unknown, contact: { name: string; phoneE164: string; email: string | null }) {
  if (!parameters || typeof parameters !== 'object') return undefined;
  const input = parameters as Record<string, unknown>;
  const components: Array<{ type: 'header' | 'body'; parameters: Array<{ type: 'text'; text: string }> }> = [];
  for (const type of ['header', 'body'] as const) {
    const values = input[type];
    if (Array.isArray(values) && values.length) {
      components.push({
        type,
        parameters: values.map((value) => ({ type: 'text', text: resolveText(String(value), contact) })),
      });
    }
  }
  return components.length ? components : undefined;
}

export async function ensureCampaignConversation(input: {
  organizationId: string;
  contactId: string;
  campaignId: string;
}) {
  const existing = await prisma.conversation.findFirst({
    where: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      status: { not: 'CLOSED' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      sourceCampaignId: input.campaignId,
      status: 'UNASSIGNED',
    },
  });
}

export async function createCampaignMessage(input: {
  organizationId: string;
  recipientId: string;
  contactId: string;
  campaignId: string;
  metaMessageId: string;
}) {
  const conversation = await ensureCampaignConversation(input);
  const message = await prisma.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: input.contactId,
      campaignRecipientId: input.recipientId,
      metaMessageId: input.metaMessageId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      status: MessageStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}
