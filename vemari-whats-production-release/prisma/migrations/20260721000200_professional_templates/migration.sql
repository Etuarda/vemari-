CREATE TYPE "TemplateParameterFormat" AS ENUM ('NAMED', 'POSITIONAL');
CREATE TYPE "TemplateOrigin" AS ENUM ('META', 'SIMULATOR');

ALTER TABLE "WhatsAppTemplate"
  ALTER COLUMN "metaTemplateId" DROP NOT NULL,
  ADD COLUMN "parameterFormat" "TemplateParameterFormat" NOT NULL DEFAULT 'NAMED',
  ADD COLUMN "origin" "TemplateOrigin" NOT NULL DEFAULT 'META',
  ADD COLUMN "providerUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "ttl" INTEGER,
  ADD COLUMN "rawProviderPayload" JSONB;
