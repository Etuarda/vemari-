-- Vemari Whats Platform - baseline schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "Role" AS ENUM ('ADMIN','MARKETING_MANAGER','SUPERVISOR','ATTENDANT','READ_ONLY');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','DISABLED');
CREATE TYPE "ConsentStatus" AS ENUM ('UNKNOWN','OPTED_IN','OPTED_OUT','BLOCKED');
CREATE TYPE "TemplateStatus" AS ENUM ('PENDING','APPROVED','REJECTED','PAUSED','DISABLED');
CREATE TYPE "TemplateCategory" AS ENUM ('MARKETING','UTILITY','AUTHENTICATION','UNKNOWN');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT','VALIDATING','SCHEDULED','PROCESSING','PAUSED','COMPLETED','CANCELED','FAILED');
CREATE TYPE "CampaignRunStatus" AS ENUM ('PREPARING','PROCESSING','PAUSED','COMPLETED','CANCELED','FAILED');
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING','QUEUED','SUBMITTED','SENT','DELIVERED','READ','FAILED','CANCELED','SUPPRESSED');
CREATE TYPE "ConversationStatus" AS ENUM ('UNASSIGNED','WAITING','ASSIGNED','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND','OUTBOUND','INTERNAL','SYSTEM');
CREATE TYPE "MessageType" AS ENUM ('TEXT','TEMPLATE','IMAGE','DOCUMENT','AUDIO','VIDEO','LOCATION','INTERACTIVE','INTERNAL_NOTE','SYSTEM_EVENT','UNKNOWN');
CREATE TYPE "MessageStatus" AS ENUM ('PENDING','SUBMITTED','SENT','DELIVERED','READ','FAILED','RECEIVED');
CREATE TYPE "AssignmentAction" AS ENUM ('ASSIGNED','TRANSFERRED','UNASSIGNED','CLOSED','REOPENED');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS','FAILURE','DENIED');
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED','PROCESSING','PROCESSED','FAILED','DUPLICATE');

CREATE TABLE "Organization" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(3),
  "lastLoginAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "User_organizationId_email_key" UNIQUE ("organizationId","email")
);
CREATE INDEX "User_organizationId_role_status_idx" ON "User"("organizationId","role","status");

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId","expiresAt");

CREATE TABLE "Contact" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "email" TEXT,
  "marketingStatus" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "source" TEXT,
  "customFields" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Contact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Contact_organizationId_phoneE164_key" UNIQUE ("organizationId","phoneE164")
);
CREATE INDEX "Contact_organizationId_marketingStatus_deletedAt_idx" ON "Contact"("organizationId","marketingStatus","deletedAt");

CREATE TABLE "ConsentRecord" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "ConsentStatus" NOT NULL,
  "purpose" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "evidence" TEXT,
  "termVersion" TEXT,
  "grantedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  "createdByUserId" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsentRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ConsentRecord_organizationId_contactId_createdAt_idx" ON "ConsentRecord"("organizationId","contactId","createdAt");

CREATE TABLE "SuppressionEntry" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "liftedAt" TIMESTAMPTZ(3),
  "liftedByUserId" TEXT,
  CONSTRAINT "SuppressionEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SuppressionEntry_organizationId_contactId_liftedAt_idx" ON "SuppressionEntry"("organizationId","contactId","liftedAt");
CREATE UNIQUE INDEX "SuppressionEntry_active_unique" ON "SuppressionEntry"("organizationId","contactId") WHERE "liftedAt" IS NULL;

CREATE TABLE "Tag" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_organizationId_name_key" UNIQUE ("organizationId","name")
);

CREATE TABLE "ContactTag" (
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId"),
  CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Segment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "criteria" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Segment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Segment_organizationId_name_key" UNIQUE ("organizationId","name")
);

CREATE TABLE "WhatsAppTemplate" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "metaTemplateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "category" "TemplateCategory" NOT NULL,
  "status" "TemplateStatus" NOT NULL,
  "components" JSONB NOT NULL,
  "qualityRating" TEXT,
  "lastSyncedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppTemplate_organizationId_metaTemplateId_key" UNIQUE ("organizationId","metaTemplateId"),
  CONSTRAINT "WhatsAppTemplate_organizationId_name_language_key" UNIQUE ("organizationId","name","language")
);
CREATE INDEX "WhatsAppTemplate_organizationId_category_status_idx" ON "WhatsAppTemplate"("organizationId","category","status");

CREATE TABLE "Campaign" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "templateId" TEXT NOT NULL,
  "segmentId" TEXT,
  "templateParameters" JSONB,
  "scheduledAt" TIMESTAMPTZ(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Campaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Campaign_organizationId_status_createdAt_idx" ON "Campaign"("organizationId","status","createdAt");

CREATE TABLE "CampaignRun" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignId" TEXT NOT NULL,
  "status" "CampaignRunStatus" NOT NULL DEFAULT 'PREPARING',
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "submittedCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "readCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "suppressedCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "confirmedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CampaignRun_campaignId_status_idx" ON "CampaignRun"("campaignId","status");

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "ConversationStatus" NOT NULL DEFAULT 'UNASSIGNED',
  "assignedUserId" TEXT,
  "sourceCampaignId" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMPTZ(3),
  "lastInboundAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Conversation_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Conversation_organizationId_status_assignedUserId_lastMessageAt_idx" ON "Conversation"("organizationId","status","assignedUserId","lastMessageAt");

CREATE TABLE "CampaignRecipient" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignRunId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
  "metaMessageId" TEXT UNIQUE,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "estimatedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "confirmedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "readAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRecipient_campaignRunId_fkey" FOREIGN KEY ("campaignRunId") REFERENCES "CampaignRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CampaignRecipient_campaignRunId_contactId_key" UNIQUE ("campaignRunId","contactId")
);
CREATE INDEX "CampaignRecipient_campaignRunId_status_idx" ON "CampaignRecipient"("campaignRunId","status");

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "campaignRecipientId" TEXT UNIQUE,
  "metaMessageId" TEXT UNIQUE,
  "direction" "MessageDirection" NOT NULL,
  "type" "MessageType" NOT NULL,
  "status" "MessageStatus" NOT NULL,
  "senderUserId" TEXT,
  "content" TEXT,
  "payload" JSONB,
  "submittedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "readAt" TIMESTAMPTZ(3),
  "failedAt" TIMESTAMPTZ(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Message_campaignRecipientId_fkey" FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId","createdAt");
CREATE INDEX "Message_organizationId_status_createdAt_idx" ON "Message"("organizationId","status","createdAt");

CREATE TABLE "ConversationAssignment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "conversationId" TEXT NOT NULL,
  "action" "AssignmentAction" NOT NULL,
  "fromUserId" TEXT,
  "toUserId" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationAssignment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationAssignment_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConversationAssignment_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ConversationAssignment_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ConversationAssignment_conversationId_createdAt_idx" ON "ConversationAssignment"("conversationId","createdAt");

CREATE TABLE "QuickReply" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuickReply_organizationId_shortcut_key" UNIQUE ("organizationId","shortcut")
);

CREATE TABLE "WebhookEvent" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL,
  "signatureValid" BOOLEAN NOT NULL,
  "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WebhookEvent_organizationId_status_receivedAt_idx" ON "WebhookEvent"("organizationId","status","receivedAt");

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "actorRole" "Role",
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "result" "AuditResult" NOT NULL,
  "previousState" JSONB,
  "newState" JSONB,
  "reason" TEXT,
  "requestId" TEXT,
  "correlationId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId","createdAt");
CREATE INDEX "AuditLog_organizationId_actorUserId_createdAt_idx" ON "AuditLog"("organizationId","actorUserId","createdAt");
CREATE INDEX "AuditLog_organizationId_action_resourceType_idx" ON "AuditLog"("organizationId","action","resourceType");

CREATE TABLE "PricingRule" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "category" "TemplateCategory" NOT NULL,
  "volumeTierStart" INTEGER NOT NULL,
  "volumeTierEnd" INTEGER,
  "unitPrice" DECIMAL(12,6) NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveUntil" TIMESTAMPTZ(3),
  "sourceReference" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PricingRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PricingRule_organizationId_countryCode_category_effectiveFrom_idx" ON "PricingRule"("organizationId","countryCode","category","effectiveFrom");

-- Audit logs are append-only. Application users cannot alter historical records.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_immutable_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER "AuditLog_immutable_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
