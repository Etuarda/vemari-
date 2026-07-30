import { randomUUID } from 'node:crypto';
import {
  MessageStatus,
  OutboundAttemptStatus,
  Prisma,
  PrismaClient,
  RecipientStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { OutboundJob } from '@vemari/contracts';
import { MetaApiError, OutboundProvider } from '@vemari/meta';
import {
  buildTemplateComponents,
  completeRunIfSettled,
  createCampaignMessage,
} from './campaign.processor';
import { meta, prisma } from '../lib/runtime';
import { publishRealtime } from '../lib/realtime';

type MarketingJob = Extract<OutboundJob, { kind: 'MARKETING_TEMPLATE' }>;
type TextJob = Extract<OutboundJob, { kind: 'SERVICE_TEXT' }>;

export type OutboundProcessorDependencies = {
  db: PrismaClient;
  provider: OutboundProvider;
  publish: typeof publishRealtime;
};

const runtimeDependencies: OutboundProcessorDependencies = {
  db: prisma,
  provider: meta,
  publish: publishRealtime,
};

export async function processOutbound(job: Job<OutboundJob>) {
  return processOutboundWith(job, runtimeDependencies);
}

export async function processOutboundWith(
  job: Job<OutboundJob>,
  dependencies: OutboundProcessorDependencies,
) {
  if (job.data.kind === 'MARKETING_TEMPLATE') {
    return processMarketingTemplate(job as Job<MarketingJob>, dependencies);
  }
  return processServiceText(job as Job<TextJob>, dependencies);
}

async function processMarketingTemplate(
  job: Job<MarketingJob>,
  { db, provider, publish }: OutboundProcessorDependencies,
) {
  const current = await db.outboundAttempt.findFirst({
    where: { id: job.data.outboundAttemptId, organizationId: job.data.organizationId },
  });
  if (!current) return;
  if (
    current.status === OutboundAttemptStatus.SUBMITTED ||
    current.status === OutboundAttemptStatus.PERMANENT_FAILED ||
    current.status === OutboundAttemptStatus.UNKNOWN
  ) {
    return;
  }
  if (current.status === OutboundAttemptStatus.SENDING) {
    if (job.attemptsMade > 0 && current.providerCallStartedAt) {
      await markUnknown(db, current.id, current.campaignRecipientId, current.campaignRunId, {
        code: 'STALE_SENDING_AFTER_PROVIDER_CALL',
        message:
          'O processamento anterior terminou sem confirmação local após iniciar a chamada externa.',
      });
    }
    return;
  }

  const claimToken = randomUUID();
  const claimed = await db.outboundAttempt.updateMany({
    where: {
      id: current.id,
      status: {
        in: [OutboundAttemptStatus.PENDING, OutboundAttemptStatus.RETRYABLE_FAILED],
      },
    },
    data: {
      status: OutboundAttemptStatus.SENDING,
      claimToken,
      claimedAt: new Date(),
      processingCount: { increment: 1 },
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count !== 1) return;

  let providerCallStarted = false;
  let providerMessageId: string | undefined;
  try {
    const attempt = await db.outboundAttempt.findUniqueOrThrow({
      where: { claimToken },
      include: {
        contact: true,
        campaignRun: { include: { campaign: { include: { template: true } } } },
      },
    });
    const run = attempt.campaignRun;
    if (run.status !== 'PROCESSING') {
      await db.outboundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: OutboundAttemptStatus.RETRYABLE_FAILED,
          claimToken: null,
          lastErrorCode: 'RUN_NOT_PROCESSING',
          lastErrorMessage: `Campaign run is ${run.status}`,
        },
      });
      return;
    }

    const campaign = run.campaign;
    const request = {
      to: attempt.contact.phoneE164.slice(1),
      templateName: campaign.template.name,
      languageCode: campaign.template.language,
      components: buildTemplateComponents(
        campaign.templateParameters,
        attempt.contact,
        campaign.template.parameterFormat,
      ),
    };

    await db.outboundAttempt.update({
      where: { claimToken },
      data: { providerCallStartedAt: new Date() },
    });
    providerCallStarted = true;
    const result = await provider.sendTemplate(request);
    providerMessageId = result.messageId;
    const now = new Date();

    const [recipient, message] = await db.$transaction(async (tx) => {
      const transitioned = await tx.outboundAttempt.updateMany({
        where: {
          id: attempt.id,
          claimToken,
          status: OutboundAttemptStatus.SENDING,
        },
        data: {
          status: OutboundAttemptStatus.SUBMITTED,
          providerMessageId: result.messageId,
          submittedAt: now,
          claimToken: null,
        },
      });
      if (transitioned.count !== 1) throw new Error('OUTBOUND_CLAIM_LOST');
      const updatedRecipient = await tx.campaignRecipient.update({
        where: { id: attempt.campaignRecipientId },
        data: {
          status: RecipientStatus.SUBMITTED,
          metaMessageId: result.messageId,
          submittedAt: now,
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.campaignRun.update({
        where: { id: attempt.campaignRunId },
        data: { submittedCount: { increment: 1 } },
      });
      const createdMessage = await createCampaignMessage(tx, {
        organizationId: attempt.organizationId,
        outboundAttemptId: attempt.id,
        recipientId: attempt.campaignRecipientId,
        contactId: attempt.contactId,
        campaignId: campaign.id,
        providerMessageId: result.messageId,
      });
      await completeRunIfSettled(tx, attempt.campaignRunId);
      return [updatedRecipient, createdMessage] as const;
    });

    await publish(job.data.organizationId, 'campaign.progress.updated', {
      campaignId: campaign.id,
      runId: run.id,
      recipient,
    });
    await publish(job.data.organizationId, 'message.created', message);
  } catch (error) {
    const failure = classifyFailure(error, providerCallStarted);
    if (failure.kind === 'UNKNOWN') {
      await markUnknown(db, current.id, current.campaignRecipientId, current.campaignRunId, {
        code: failure.code,
        message: failure.message,
        providerMessageId,
      });
      return;
    }
    if (failure.kind === 'PERMANENT_FAILED') {
      await markPermanentFailure(
        db,
        current.id,
        current.campaignRecipientId,
        current.campaignRunId,
        failure,
      );
      return;
    }

    await db.$transaction(async (tx) => {
      await tx.outboundAttempt.updateMany({
        where: { id: current.id, claimToken, status: OutboundAttemptStatus.SENDING },
        data: {
          status: OutboundAttemptStatus.RETRYABLE_FAILED,
          claimToken: null,
          providerCallStartedAt: null,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
        },
      });
      await tx.campaignRecipient.update({
        where: { id: current.campaignRecipientId },
        data: {
          status: RecipientStatus.QUEUED,
          errorCode: failure.code,
          errorMessage: failure.message,
        },
      });
    });
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (!isLastAttempt) throw error;
  }
}

type ClassifiedFailure = {
  kind: 'RETRYABLE_FAILED' | 'PERMANENT_FAILED' | 'UNKNOWN';
  code: string;
  message: string;
};

export function classifyFailure(error: unknown, providerCallStarted: boolean): ClassifiedFailure {
  const code =
    error instanceof MetaApiError && error.code
      ? String(error.code)
      : error instanceof Error && error.message === 'OUTBOUND_CLAIM_LOST'
        ? 'OUTBOUND_CLAIM_LOST'
        : 'OUTBOUND_ERROR';
  const message = error instanceof Error ? error.message : 'Falha no envio';
  if (providerCallStarted) {
    if (!(error instanceof MetaApiError) || error.failureCertainty === 'AMBIGUOUS') {
      return { kind: 'UNKNOWN', code, message };
    }
    if (error.isTransient) return { kind: 'RETRYABLE_FAILED', code, message };
    return { kind: 'PERMANENT_FAILED', code, message };
  }
  return { kind: 'RETRYABLE_FAILED', code, message };
}

async function markUnknown(
  db: PrismaClient,
  attemptId: string,
  recipientId: string,
  runId: string,
  failure: { code: string; message: string; providerMessageId?: string },
) {
  const persist = (providerMessageId?: string) =>
    db.$transaction(async (tx) => {
      await tx.outboundAttempt.update({
        where: { id: attemptId },
        data: {
          status: OutboundAttemptStatus.UNKNOWN,
          claimToken: null,
          providerMessageId,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
        },
      });
      await tx.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: RecipientStatus.UNKNOWN,
          errorCode: failure.code,
          errorMessage: failure.message,
        },
      });
      await completeRunIfSettled(tx, runId);
    });
  try {
    await persist(failure.providerMessageId);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    await persist();
  }
}

async function markPermanentFailure(
  db: PrismaClient,
  attemptId: string,
  recipientId: string,
  runId: string,
  failure: ClassifiedFailure,
) {
  await db.$transaction(async (tx) => {
    const transitioned = await tx.outboundAttempt.updateMany({
      where: { id: attemptId, status: OutboundAttemptStatus.SENDING },
      data: {
        status: OutboundAttemptStatus.PERMANENT_FAILED,
        claimToken: null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
      },
    });
    await tx.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: RecipientStatus.FAILED,
        failedAt: new Date(),
        errorCode: failure.code,
        errorMessage: failure.message,
      },
    });
    if (transitioned.count === 1) {
      await tx.campaignRun.update({
        where: { id: runId },
        data: { failedCount: { increment: 1 } },
      });
    }
    await completeRunIfSettled(tx, runId);
  });
}

async function processServiceText(
  job: Job<TextJob>,
  { db, provider, publish }: OutboundProcessorDependencies,
) {
  const message = await db.message.findFirst({
    where: { id: job.data.messageId, organizationId: job.data.organizationId },
    include: { contact: true, conversation: true },
  });
  if (!message || message.status !== MessageStatus.PENDING || !message.content) return;

  try {
    const result = await provider.sendText({
      to: message.contact.phoneE164.slice(1),
      text: message.content,
    });
    const updated = await db.$transaction(async (tx) => {
      const submitted = await tx.message.update({
        where: { id: message.id },
        data: {
          metaMessageId: result.messageId,
          status: MessageStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      await tx.conversation.update({
        where: { id: message.conversationId },
        data: { lastMessageAt: new Date(), status: 'WAITING_CUSTOMER' },
      });
      return submitted;
    });
    await publish(job.data.organizationId, 'message.status.updated', updated);
  } catch (error) {
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const safeRetry =
      error instanceof MetaApiError &&
      error.isTransient &&
      error.failureCertainty === 'NOT_ACCEPTED';
    if (safeRetry && !isLastAttempt) throw error;
    const updated = await db.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorCode:
          error instanceof MetaApiError && error.code ? String(error.code) : 'OUTBOUND_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Falha no envio',
      },
    });
    await publish(job.data.organizationId, 'message.status.updated', updated);
  }
}
