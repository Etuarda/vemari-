import {
  CampaignRunStatus,
  MessageStatus,
  RecipientStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { OutboundJob } from '@vemari/contracts';
import { MetaApiError } from '@vemari/meta';
import { buildTemplateComponents, createCampaignMessage } from './campaign.processor';
import { meta, prisma } from '../lib/runtime';
import { publishRealtime } from '../lib/realtime';

export async function processOutbound(job: Job<OutboundJob>) {
  if (job.data.kind === 'MARKETING_TEMPLATE') {
    return processMarketingTemplate(job as Job<Extract<OutboundJob, { kind: 'MARKETING_TEMPLATE' }>>);
  }
  return processServiceText(job as Job<Extract<OutboundJob, { kind: 'SERVICE_TEXT' }>>);
}

async function processMarketingTemplate(job: Job<Extract<OutboundJob, { kind: 'MARKETING_TEMPLATE' }>>) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      id: job.data.campaignRecipientId,
      campaignRun: { campaign: { organizationId: job.data.organizationId } },
    },
    include: {
      contact: true,
      campaignRun: {
        include: {
          campaign: { include: { template: true } },
        },
      },
    },
  });
  if (!recipient) return;

  const run = recipient.campaignRun;
  if (run.status === CampaignRunStatus.PAUSED) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: RecipientStatus.PENDING },
    });
    return;
  }
  if (run.status === CampaignRunStatus.CANCELED || run.status === CampaignRunStatus.FAILED) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: RecipientStatus.CANCELED },
    });
    return;
  }
  if (recipient.status !== RecipientStatus.QUEUED && recipient.status !== RecipientStatus.PENDING) {
    return;
  }

  try {
    const campaign = run.campaign;
    const result = await meta.sendTemplate({
      to: recipient.contact.phoneE164.slice(1),
      templateName: campaign.template.name,
      languageCode: campaign.template.language,
      components: buildTemplateComponents(campaign.templateParameters, recipient.contact),
    });

    const [updatedRecipient, message] = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: RecipientStatus.SUBMITTED,
          metaMessageId: result.messageId,
          submittedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.campaignRun.update({
        where: { id: run.id },
        data: { submittedCount: { increment: 1 } },
      });
      const createdMessage = await createCampaignMessage({
        organizationId: job.data.organizationId,
        recipientId: recipient.id,
        contactId: recipient.contactId,
        campaignId: campaign.id,
        metaMessageId: result.messageId,
      });
      return [updated, createdMessage] as const;
    });

    await publishRealtime(job.data.organizationId, 'campaign.progress.updated', {
      campaignId: campaign.id,
      runId: run.id,
      recipient: updatedRecipient,
    });
    await publishRealtime(job.data.organizationId, 'message.created', message);
  } catch (error) {
    await handleOutboundFailure(job, recipient.id, run.id, error);
  }
}

async function processServiceText(job: Job<Extract<OutboundJob, { kind: 'SERVICE_TEXT' }>>) {
  const message = await prisma.message.findFirst({
    where: { id: job.data.messageId, organizationId: job.data.organizationId },
    include: { contact: true, conversation: true },
  });
  if (!message || message.status !== MessageStatus.PENDING || !message.content) return;

  try {
    const result = await meta.sendText({
      to: message.contact.phoneE164.slice(1),
      text: message.content,
    });
    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        metaMessageId: result.messageId,
        status: MessageStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { lastMessageAt: new Date(), status: 'WAITING_CUSTOMER' },
    });
    await publishRealtime(job.data.organizationId, 'message.status.updated', updated);
  } catch (error) {
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const transient = error instanceof MetaApiError && error.isTransient;
    if (transient && !isLastAttempt) throw error;
    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorCode: error instanceof MetaApiError && error.code ? String(error.code) : 'OUTBOUND_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Falha no envio',
      },
    });
    await publishRealtime(job.data.organizationId, 'message.status.updated', updated);
    if (transient && !isLastAttempt) throw error;
  }
}

async function handleOutboundFailure(
  job: Job,
  recipientId: string,
  runId: string,
  error: unknown,
) {
  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
  const transient = error instanceof MetaApiError && error.isTransient;
  if (transient && !isLastAttempt) throw error;

  const updated = await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: {
      status: RecipientStatus.FAILED,
      failedAt: new Date(),
      errorCode: error instanceof MetaApiError && error.code ? String(error.code) : 'OUTBOUND_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Falha no envio',
    },
  });
  await prisma.campaignRun.update({
    where: { id: runId },
    data: { failedCount: { increment: 1 } },
  });
  await publishRealtime(job.data.organizationId, 'campaign.progress.updated', {
    runId,
    recipient: updated,
  });
}
