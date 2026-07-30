import {
  CampaignRunStatus,
  CampaignStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  RecipientStatus,
  TemplateParameterFormat,
} from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { CampaignDispatchJob, OutboundJob, QUEUE_NAMES } from '@vemari/contracts';
import { appConfig } from '../../shared/config';
import { prisma, redis } from '../lib/runtime';

const PROVIDER = 'META_CLOUD_API';

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

  for (const recipient of recipients) {
    await createAttemptAndOutbox({
      organizationId: job.data.organizationId,
      campaignRunId: run.id,
      recipientId: recipient.id,
      contactId: recipient.contactId,
    });
  }

  const outbound = new Queue<OutboundJob>(QUEUE_NAMES.WHATSAPP_OUTBOUND, { connection: redis });
  await publishPendingOutbox(run.id, outbound);

  const pending = await prisma.campaignRecipient.count({
    where: { campaignRunId: run.id, status: RecipientStatus.PENDING },
  });
  if (pending > 0) {
    const dispatchQueue = new Queue<CampaignDispatchJob>(QUEUE_NAMES.CAMPAIGN_DISPATCH, {
      connection: redis,
    });
    await dispatchQueue.add('dispatch', job.data, {
      jobId: `dispatch:${run.id}:${Date.now()}`,
      delay: 250,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
    });
    await dispatchQueue.close();
  }
  await outbound.close();
}

async function createAttemptAndOutbox(input: {
  organizationId: string;
  campaignRunId: string;
  recipientId: string;
  contactId: string;
}) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.campaignRecipient.updateMany({
      where: { id: input.recipientId, status: RecipientStatus.PENDING },
      data: { status: RecipientStatus.QUEUED },
    });
    if (claimed.count !== 1) return;

    const attempt = await tx.outboundAttempt.create({
      data: {
        organizationId: input.organizationId,
        campaignRunId: input.campaignRunId,
        campaignRecipientId: input.recipientId,
        contactId: input.contactId,
        provider: PROVIDER,
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        outboundAttemptId: attempt.id,
        topic: QUEUE_NAMES.WHATSAPP_OUTBOUND,
        payload: {
          kind: 'MARKETING_TEMPLATE',
          organizationId: input.organizationId,
          outboundAttemptId: attempt.id,
        },
      },
    });
  });
}

async function publishPendingOutbox(campaignRunId: string, outbound: Queue<OutboundJob>) {
  const events = await prisma.outboxEvent.findMany({
    where: { publishedAt: null, outboundAttempt: { campaignRunId } },
    orderBy: { createdAt: 'asc' },
  });
  for (const event of events) {
    const payload = event.payload as OutboundJob;
    if (payload.kind !== 'MARKETING_TEMPLATE') continue;
    await outbound.add('marketing-template', payload, {
      jobId: `outbound:${event.outboundAttemptId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 86_400, count: 50_000 },
      removeOnFail: { age: 604_800, count: 50_000 },
    });
    await prisma.outboxEvent.updateMany({
      where: { id: event.id, publishedAt: null },
      data: { publishedAt: new Date() },
    });
  }
}

export function resolveText(
  value: string,
  contact: { name: string; phoneE164: string; email: string | null },
): string {
  return value
    .replaceAll('{{contact.name}}', contact.name)
    .replaceAll('{{contact.phone}}', contact.phoneE164)
    .replaceAll('{{contact.email}}', contact.email ?? '');
}

export function buildTemplateComponents(
  parameters: unknown,
  contact: { name: string; phoneE164: string; email: string | null },
  parameterFormat: TemplateParameterFormat = TemplateParameterFormat.POSITIONAL,
) {
  if (!parameters || typeof parameters !== 'object') return undefined;
  const input = parameters as Record<string, unknown>;
  const components: Array<{
    type: 'header' | 'body';
    parameters: Array<{ type: 'text'; text: string; parameter_name?: string }>;
  }> = [];
  for (const type of ['header', 'body'] as const) {
    const values = input[type];
    if (
      parameterFormat === TemplateParameterFormat.NAMED &&
      values &&
      typeof values === 'object' &&
      !Array.isArray(values)
    ) {
      const named = Object.entries(values as Record<string, unknown>);
      if (!named.length) continue;
      components.push({
        type,
        parameters: named.map(([parameter_name, value]) => ({
          type: 'text',
          parameter_name,
          text: resolveText(String(value), contact),
        })),
      });
    } else if (Array.isArray(values) && values.length) {
      components.push({
        type,
        parameters: values.map((value) => ({
          type: 'text',
          text: resolveText(String(value), contact),
        })),
      });
    }
  }
  return components.length ? components : undefined;
}

export async function ensureCampaignConversation(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; contactId: string; campaignId: string },
) {
  const existing = await tx.conversation.findFirst({
    where: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      status: { not: 'CLOSED' },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;
  return tx.conversation.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      sourceCampaignId: input.campaignId,
      status: 'UNASSIGNED',
    },
  });
}

export async function createCampaignMessage(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    outboundAttemptId: string;
    recipientId: string;
    contactId: string;
    campaignId: string;
    providerMessageId: string;
  },
) {
  const conversation = await ensureCampaignConversation(tx, input);
  const message = await tx.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      contactId: input.contactId,
      campaignRecipientId: input.recipientId,
      outboundAttemptId: input.outboundAttemptId,
      metaMessageId: input.providerMessageId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEMPLATE,
      status: MessageStatus.SUBMITTED,
      submittedAt: new Date(),
    },
  });
  await tx.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

export async function completeRunIfSettled(tx: Prisma.TransactionClient, runId: string) {
  const open = await tx.campaignRecipient.count({
    where: {
      campaignRunId: runId,
      status: { in: [RecipientStatus.PENDING, RecipientStatus.QUEUED] },
    },
  });
  if (open !== 0) return;
  const run = await tx.campaignRun.findUniqueOrThrow({ where: { id: runId } });
  await tx.campaignRun.update({
    where: { id: runId },
    data: { status: CampaignRunStatus.COMPLETED, completedAt: new Date() },
  });
  await tx.campaign.update({
    where: { id: run.campaignId },
    data: { status: CampaignStatus.COMPLETED },
  });
}
