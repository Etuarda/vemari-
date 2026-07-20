/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const seedUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function seedUsers(): z.infer<typeof seedUserSchema>[] {
  const raw = required('SEED_USERS_JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SEED_USERS_JSON deve ser um JSON válido.');
  }
  const users = z.array(seedUserSchema).min(1).parse(parsed);
  if (!users.some((user) => user.role === Role.ADMIN)) {
    throw new Error('SEED_USERS_JSON deve conter pelo menos um administrador.');
  }
  const duplicated = users
    .map((user) => user.email.toLowerCase())
    .filter((email, index, list) => list.indexOf(email) !== index);
  if (duplicated.length) throw new Error(`E-mails duplicados no seed: ${duplicated.join(', ')}`);
  return users;
}

async function upsertUser(input: {
  organizationId: string;
  email: string;
  name: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
      },
    },
    update: {
      name: input.name,
      role: input.role,
      status: UserStatus.ACTIVE,
    },
    create: {
      organizationId: input.organizationId,
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
    },
  });
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: required('VEMARI_ORGANIZATION_SLUG') },
    update: { name: required('VEMARI_ORGANIZATION_NAME') },
    create: {
      slug: required('VEMARI_ORGANIZATION_SLUG'),
      name: required('VEMARI_ORGANIZATION_NAME'),
    },
  });

  for (const user of seedUsers()) {
    await upsertUser({ organizationId: organization.id, ...user });
  }

  console.log(`Seed concluído para ${organization.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
