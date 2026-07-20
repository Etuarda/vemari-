import {
  ConsentStatus,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
  RecipientStatus,
  TemplateCategory,
  WebhookStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { WebhookJob } from '@vemari/contracts';
import { prisma } from '../lib/runtime';
import { publishRealtime } from '../lib/realtime';
import { mapMessageType, mapStatus } from '../lib/status-mapping';

const OPT_OUT_WORDS = new Set(['sair', 'parar', 'stop', 'cancelar', 'remover']);

export async function processWebhook(job: Job<WebhookJob>) {
  const event = await prisma.webhookEvent.findFirst({
    where: { id: job.data.webhookEventId, organizationId: job.data.organizationId },
  });
  if (!event || event.status === WebhookStatus.PROCESSED) return;

  await prisma.webhookEvent.update({ where: { id: event.id }, data: { status: WebhookStatus.PROCESSING } });
  try {
    const body = event.payload as Record<string, any>;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        await processStatuses(job.data.organizationId, value.statuses ?? []);
        await processIncomingMessages(job.data.organizationId, value);
        await processUserPreferences(job.data.organizationId, change.field, value);
      }
    }
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { status: WebhookStatus.PROCESSED, processedAt: new Date(), errorMessage: null },
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Falha no processamento',
      },
    });
    throw error;
  }
}

async function processStatuses(organizationId: string, statuses: any[]) {
  for (const status of statuses) {
    const mapped = mapStatus(String(status.status ?? ''));
    const metaMessageId = String(status.id ?? '');
    if (!mapped || !metaMessageId) continue;
    const now = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
    const error = Array.isArray(status.errors) ? status.errors[0] : undefined;

    const message = await prisma.message.findUnique({ where: { metaMessageId } });
    if (message) {
      const update: Prisma.MessageUpdateInput = {
        status: mapped.message,
        [mapped.dateField]: now,
        ...(error ? { errorCode: String(error.code ?? ''), errorMessage: String(error.title ?? error.message ?? '') } : {}),
      };
      const updated = await prisma.message.update({ where: { id: message.id }, data: update });
      await publishRealtime(organizationId, 'message.status.updated', updated);
    }

    const recipient = await prisma.campaignRecipient.findUnique({
      where: { metaMessageId },
      include: { campaignRun: true },
    });
    if (recipient) {
      const update: Prisma.CampaignRecipientUpdateInput = {
        status: mapped.recipient,
        [mapped.dateField]: now,
        ...(error ? { errorCode: String(error.code ?? ''), errorMessage: String(error.title ?? error.message ?? '') } : {}),
      };
      const updated = await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: update });
      await recalculateRun(recipient.campaignRunId);
      await applyPricing(organizationId, status, recipient.id);
      await publishRealtime(organizationId, 'campaign.progress.updated', {
        runId: recipient.campaignRunId,
        recipient: updated,
      });
    }
  }
}

async function recalculateRun(runId: string) {
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignRunId: runId },
    _count: { _all: true },
  });
  const count = (status: RecipientStatus) => grouped.find((item: { status: RecipientStatus; _count: { _all: number } }) => item.status === status)?._count._all ?? 0;
  await prisma.campaignRun.update({
    where: { id: runId },
    data: {
      submittedCount: count(RecipientStatus.SUBMITTED) + count(RecipientStatus.SENT) + count(RecipientStatus.DELIVERED) + count(RecipientStatus.READ),
      sentCount: count(RecipientStatus.SENT) + count(RecipientStatus.DELIVERED) + count(RecipientStatus.READ),
      deliveredCount: count(RecipientStatus.DELIVERED) + count(RecipientStatus.READ),
      readCount: count(RecipientStatus.READ),
      failedCount: count(RecipientStatus.FAILED),
      suppressedCount: count(RecipientStatus.SUPPRESSED),
    },
  });
}

async function applyPricing(organizationId: string, status: any, recipientId: string) {
  if (!status.pricing?.billable) return;
  const categoryText = String(status.pricing.category ?? '').toUpperCase();
  const category = Object.values(TemplateCategory).includes(categoryText as TemplateCategory)
    ? (categoryText as TemplateCategory)
    : TemplateCategory.MARKETING;
  const now = new Date();
  const rule = await prisma.pricingRule.findFirst({
    where: {
      organizationId,
      countryCode: 'BR',
      category,
      effectiveFrom: { lte: now },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }],
    },
    orderBy: [{ volumeTierStart: 'desc' }, { effectiveFrom: 'desc' }],
  });
  if (!rule) return;
  const recipient = await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { confirmedCost: rule.unitPrice },
    include: { campaignRun: true },
  });
  const aggregate = await prisma.campaignRecipient.aggregate({
    where: { campaignRunId: recipient.campaignRunId },
    _sum: { confirmedCost: true },
  });
  await prisma.campaignRun.update({
    where: { id: recipient.campaignRunId },
    data: { confirmedCost: aggregate._sum.confirmedCost ?? 0 },
  });
}

async function processIncomingMessages(organizationId: string, value: any) {
  const profileByWaId = new Map<string, string>();
  for (const contact of value.contacts ?? []) {
    profileByWaId.set(String(contact.wa_id ?? ''), String(contact.profile?.name ?? 'Contato WhatsApp'));
  }

  for (const incoming of value.messages ?? []) {
    const metaMessageId = String(incoming.id ?? '');
    const phone = String(incoming.from ?? '');
    if (!metaMessageId || !phone) continue;
    const existing = await prisma.message.findUnique({ where: { metaMessageId } });
    if (existing) continue;

    const phoneE164 = `+${phone.replace(/\D/g, '')}`;
    const contact = await prisma.contact.upsert({
      where: { organizationId_phoneE164: { organizationId, phoneE164 } },
      update: { name: profileByWaId.get(phone) || undefined },
      create: {
        organizationId,
        phoneE164,
        name: profileByWaId.get(phone) ?? 'Contato WhatsApp',
        source: 'WHATSAPP_INBOUND',
        marketingStatus: ConsentStatus.UNKNOWN,
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: { organizationId, contactId: contact.id, status: { not: ConversationStatus.CLOSED } },
      orderBy: { createdAt: 'desc' },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId,
          contactId: contact.id,
          status: ConversationStatus.WAITING,
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
          unreadCount: 1,
        },
      });
    }

    const content = incoming.text?.body ? String(incoming.text.body) : null;
    const message = await prisma.message.create({
      data: {
        organizationId,
        conversationId: conversation.id,
        contactId: contact.id,
        metaMessageId,
        direction: MessageDirection.INBOUND,
        type: mapMessageType(String(incoming.type ?? 'unknown')),
        status: MessageStatus.RECEIVED,
        content,
        payload: incoming,
      },
    });
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastInboundAt: message.createdAt,
        lastMessageAt: message.createdAt,
        unreadCount: { increment: 1 },
        status: conversation.assignedUserId ? ConversationStatus.IN_PROGRESS : ConversationStatus.WAITING,
      },
      include: { contact: true, assignedUser: { select: { id: true, name: true } } },
    });

    if (content && OPT_OUT_WORDS.has(content.trim().toLowerCase())) {
      await registerOptOut(organizationId, contact.id, 'WHATSAPP_KEYWORD');
    }
    await publishRealtime(organizationId, 'message.received', message);
    await publishRealtime(organizationId, 'conversation.updated', updatedConversation);
  }
}

async function processUserPreferences(organizationId: string, field: string, value: any) {
  if (field !== 'user_preferences') return;
  const preferences = Array.isArray(value.user_preferences)
    ? value.user_preferences
    : Array.isArray(value)
      ? value
      : [value];
  for (const preference of preferences) {
    const phone = String(preference.wa_id ?? preference.user_id ?? preference.phone_number ?? '');
    const setting = String(preference.preference ?? preference.status ?? '').toLowerCase();
    if (!phone || !['opted_out', 'stopped', 'disabled'].includes(setting)) continue;
    const contact = await prisma.contact.findUnique({
      where: { organizationId_phoneE164: { organizationId, phoneE164: `+${phone.replace(/\D/g, '')}` } },
    });
    if (contact) await registerOptOut(organizationId, contact.id, 'META_USER_PREFERENCES');
  }
}

async function registerOptOut(organizationId: string, contactId: string, source: string) {
  const activeSuppression = await prisma.suppressionEntry.findFirst({
    where: { organizationId, contactId, liftedAt: null },
  });
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data: { marketingStatus: ConsentStatus.OPTED_OUT } });
    await tx.consentRecord.create({
      data: {
        organizationId,
        contactId,
        status: ConsentStatus.OPTED_OUT,
        purpose: 'Marketing via WhatsApp',
        channel: 'WHATSAPP',
        source,
        revokedAt: new Date(),
        evidence: 'Solicitação recebida pelo canal WhatsApp.',
      },
    });
    if (!activeSuppression) {
      await tx.suppressionEntry.create({
        data: {
          organizationId,
          contactId,
          reason: 'Opt-out solicitado pelo titular',
          source,
        },
      });
    }
    await tx.campaignRecipient.updateMany({
      where: {
        contactId,
        status: { in: [RecipientStatus.PENDING, RecipientStatus.QUEUED] },
      },
      data: { status: RecipientStatus.SUPPRESSED },
    });
  });
  await publishRealtime(organizationId, 'contact.preference.updated', { contactId, status: ConsentStatus.OPTED_OUT });
}
