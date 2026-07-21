import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
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
  console.log(`Seed estrutural concluído para ${organization.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
