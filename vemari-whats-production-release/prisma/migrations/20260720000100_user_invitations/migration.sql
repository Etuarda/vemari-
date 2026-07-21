CREATE TYPE "InvitationType" AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET');

ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "status" TYPE "UserStatus"
  USING (
    CASE "status"::text
      WHEN 'ACTIVE' THEN 'ACTIVE'::"UserStatus"
      ELSE 'SUSPENDED'::"UserStatus"
    END
  );
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'INVITED';
DROP TYPE "UserStatus_old";

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "InvitationType" NOT NULL DEFAULT 'ACCOUNT_ACTIVATION',
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_userId_type_idx" ON "UserInvitation"("userId", "type");
CREATE INDEX "UserInvitation_expiresAt_idx" ON "UserInvitation"("expiresAt");
CREATE INDEX "UserInvitation_organizationId_createdAt_idx" ON "UserInvitation"("organizationId", "createdAt");

ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation"
  ADD CONSTRAINT "UserInvitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
