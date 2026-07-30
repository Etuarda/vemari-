CREATE TYPE "OutboundAttemptStatus" AS ENUM (
  'PENDING',
  'SENDING',
  'SUBMITTED',
  'RETRYABLE_FAILED',
  'PERMANENT_FAILED',
  'UNKNOWN'
);

ALTER TYPE "RecipientStatus" ADD VALUE 'UNKNOWN';

CREATE TABLE "OutboundAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignRunId" TEXT NOT NULL,
  "campaignRecipientId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "status" "OutboundAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "providerCallStartedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "processingCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboundAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "outboundAttemptId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message" ADD COLUMN "outboundAttemptId" TEXT;

CREATE UNIQUE INDEX "OutboundAttempt_campaignRecipientId_key" ON "OutboundAttempt"("campaignRecipientId");
CREATE UNIQUE INDEX "OutboundAttempt_claimToken_key" ON "OutboundAttempt"("claimToken");
CREATE UNIQUE INDEX "OutboundAttempt_campaignRunId_contactId_key" ON "OutboundAttempt"("campaignRunId", "contactId");
CREATE UNIQUE INDEX "OutboundAttempt_provider_providerMessageId_key" ON "OutboundAttempt"("provider", "providerMessageId");
CREATE INDEX "OutboundAttempt_organizationId_status_createdAt_idx" ON "OutboundAttempt"("organizationId", "status", "createdAt");
CREATE UNIQUE INDEX "OutboxEvent_outboundAttemptId_key" ON "OutboxEvent"("outboundAttemptId");
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");
CREATE UNIQUE INDEX "Message_outboundAttemptId_key" ON "Message"("outboundAttemptId");

ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_campaignRunId_fkey"
  FOREIGN KEY ("campaignRunId") REFERENCES "CampaignRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_campaignRecipientId_fkey"
  FOREIGN KEY ("campaignRecipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundAttempt" ADD CONSTRAINT "OutboundAttempt_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_outboundAttemptId_fkey"
  FOREIGN KEY ("outboundAttemptId") REFERENCES "OutboundAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_outboundAttemptId_fkey"
  FOREIGN KEY ("outboundAttemptId") REFERENCES "OutboundAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
