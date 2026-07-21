import 'dotenv/config';
import { InvitationType, PrismaClient, Role, UserStatus } from '@prisma/client';
import {
  ACTIVATION_INVITATION_TTL_MS,
  createInvitationToken,
} from '../../apps/backend/src/shared/invitations';

const prisma = new PrismaClient();

function argument(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

async function main() {
  const email = argument('email')?.toLowerCase();
  const name = argument('name') || 'Administrador';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Informe um e-mail válido com --email admin@vemari.com.br');
  }

  const organization = await prisma.organization.upsert({
    where: { slug: requiredEnv('VEMARI_ORGANIZATION_SLUG') },
    update: { name: requiredEnv('VEMARI_ORGANIZATION_NAME') },
    create: {
      slug: requiredEnv('VEMARI_ORGANIZATION_SLUG'),
      name: requiredEnv('VEMARI_ORGANIZATION_NAME'),
    },
  });
  const existingAdmin = await prisma.user.findFirst({
    where: {
      organizationId: organization.id,
      role: Role.ADMIN,
      status: { in: [UserStatus.INVITED, UserStatus.ACTIVE, UserStatus.SUSPENDED] },
    },
  });
  if (existingAdmin)
    throw new Error(`Bootstrap recusado: já existe um administrador (${existingAdmin.email}).`);

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(Date.now() + ACTIVATION_INVITATION_TTL_MS);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email,
        name,
        role: Role.ADMIN,
        status: UserStatus.INVITED,
        passwordHash: null,
      },
    });
    await tx.userInvitation.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        createdById: user.id,
        type: InvitationType.ACCOUNT_ACTIVATION,
        tokenHash,
        expiresAt,
      },
    });
  });

  const webUrl = requiredEnv('WEB_URL').replace(/\/$/, '');
  console.log('\nAdministrador criado.');
  console.log(`\nE-mail:\n${email}`);
  console.log(`\nLink de ativação:\n${webUrl}/activate-account?token=${token}`);
  console.log(`\nO link expira em ${expiresAt.toISOString()} e pode ser utilizado uma única vez.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
