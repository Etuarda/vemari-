import { Inject, Injectable } from '@nestjs/common';
import {
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { MetaWhatsAppClient } from '@vemari/meta';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { META_CLIENT } from '../whatsapp/meta.provider';

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  category: z.string(),
  language: z.string(),
  components: z.unknown().optional(),
});

function status(value: string): TemplateStatus {
  return Object.values(TemplateStatus).includes(value as TemplateStatus)
    ? (value as TemplateStatus)
    : TemplateStatus.PENDING;
}

function category(value: string): TemplateCategory {
  return Object.values(TemplateCategory).includes(value as TemplateCategory)
    ? (value as TemplateCategory)
    : TemplateCategory.UNKNOWN;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(META_CLIENT) private readonly meta: MetaWhatsAppClient,
  ) {}

  list(organizationId: string) {
    return this.prisma.whatsAppTemplate.findMany({
      where: { organizationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async sync(organizationId: string) {
    const rawTemplates = await this.meta.listTemplates();
    let synced = 0;
    const rejected: string[] = [];

    for (const raw of rawTemplates) {
      const parsed = templateSchema.safeParse(raw);
      if (!parsed.success) {
        rejected.push(JSON.stringify(raw).slice(0, 200));
        continue;
      }
      const template = parsed.data;
      await this.prisma.whatsAppTemplate.upsert({
        where: {
          organizationId_metaTemplateId: {
            organizationId,
            metaTemplateId: template.id,
          },
        },
        update: {
          name: template.name,
          language: template.language,
          status: status(template.status),
          category: category(template.category),
          components: (template.components ?? []) as any,
          lastSyncedAt: new Date(),
        },
        create: {
          organizationId,
          metaTemplateId: template.id,
          name: template.name,
          language: template.language,
          status: status(template.status),
          category: category(template.category),
          components: (template.components ?? []) as any,
          lastSyncedAt: new Date(),
        },
      });
      synced += 1;
    }
    return { synced, rejected: rejected.length, rejectedSamples: rejected.slice(0, 5) };
  }
}
