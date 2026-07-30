import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TemplateCategory,
  TemplateOrigin,
  TemplateParameterFormat,
  TemplateStatus,
} from '@prisma/client';
import { MetaWhatsAppClient } from '@vemari/meta';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { META_CLIENT } from '../whatsapp/meta.provider';
import { CreateTemplateDto, TemplateFiltersDto } from './templates.dto';
import { buildOfficialTemplatePayload, templateInputSchema } from './template-contracts';

const providerTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.string(),
  category: z.string(),
  language: z.string(),
  parameter_format: z.string().optional(),
  components: z.unknown().optional(),
  quality_score: z.unknown().optional(),
  message_send_ttl_seconds: z.number().int().optional(),
  last_updated_time: z.string().optional(),
});

const createResponseSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  category: z.string().optional(),
});

const publicTemplateSelect = {
  id: true,
  metaTemplateId: true,
  name: true,
  language: true,
  category: true,
  parameterFormat: true,
  status: true,
  qualityRating: true,
  components: true,
  origin: true,
  providerUpdatedAt: true,
  ttl: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WhatsAppTemplateSelect;

function mapStatus(value: string): TemplateStatus {
  const normalized = value.toUpperCase();
  return Object.values(TemplateStatus).includes(normalized as TemplateStatus)
    ? (normalized as TemplateStatus)
    : TemplateStatus.PENDING;
}

function mapCategory(value: string): TemplateCategory {
  const normalized = value.toUpperCase();
  return Object.values(TemplateCategory).includes(normalized as TemplateCategory)
    ? (normalized as TemplateCategory)
    : TemplateCategory.UNKNOWN;
}

function mapParameterFormat(value?: string): TemplateParameterFormat {
  return value?.toLowerCase() === 'positional'
    ? TemplateParameterFormat.POSITIONAL
    : TemplateParameterFormat.NAMED;
}

function safeProviderPayload(value: unknown): Prisma.JsonValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(safeProviderPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['access_token', 'token', 'app_secret'].includes(key.toLowerCase()))
        .map(([key, nested]) => [key, safeProviderPayload(nested)]),
    );
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return value as string | number | boolean;
  }
  return String(value);
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(META_CLIENT) private readonly meta: MetaWhatsAppClient,
  ) {}

  list(organizationId: string, filters: TemplateFiltersDto = {}) {
    const status = Object.values(TemplateStatus).includes(filters.status as TemplateStatus)
      ? (filters.status as TemplateStatus)
      : undefined;
    const category = Object.values(TemplateCategory).includes(filters.category as TemplateCategory)
      ? (filters.category as TemplateCategory)
      : undefined;
    return this.prisma.whatsAppTemplate.findMany({
      where: { organizationId, status, category, language: filters.language },
      select: publicTemplateSelect,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async detail(organizationId: string, id: string) {
    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id, organizationId },
      select: publicTemplateSelect,
    });
    if (!template) throw new NotFoundException('Template não encontrado.');
    return template;
  }

  async createOfficial(organizationId: string, dto: CreateTemplateDto) {
    const input = templateInputSchema.safeParse(dto);
    if (!input.success)
      throw new BadRequestException(input.error.issues.map((issue) => issue.message));
    if (!this.meta.canManageTemplates()) {
      throw new BadRequestException('WABA e token da Meta devem estar configurados.');
    }
    const rawResponse = await this.meta.createTemplate(buildOfficialTemplatePayload(input.data));
    const response = createResponseSchema.parse(rawResponse);
    return this.prisma.whatsAppTemplate.create({
      data: {
        organizationId,
        metaTemplateId: response.id,
        name: input.data.name,
        language: input.data.language,
        category: mapCategory(response.category ?? input.data.category),
        parameterFormat: mapParameterFormat(input.data.parameterFormat),
        status: mapStatus(response.status ?? 'PENDING'),
        components: input.data.components,
        origin: TemplateOrigin.META,
        ttl: input.data.ttl,
        lastSyncedAt: new Date(),
        rawProviderPayload: safeProviderPayload(rawResponse) as Prisma.InputJsonValue,
      },
      select: publicTemplateSelect,
    });
  }

  async createSimulator(organizationId: string, dto: CreateTemplateDto) {
    const input = templateInputSchema.safeParse(dto);
    if (!input.success)
      throw new BadRequestException(input.error.issues.map((issue) => issue.message));
    return this.prisma.whatsAppTemplate.create({
      data: {
        organizationId,
        metaTemplateId: null,
        name: input.data.name,
        language: input.data.language,
        category: TemplateCategory.MARKETING,
        parameterFormat: input.data.parameterFormat,
        status: TemplateStatus.PENDING,
        components: input.data.components,
        origin: TemplateOrigin.SIMULATOR,
        ttl: input.data.ttl,
        lastSyncedAt: new Date(),
      },
      select: publicTemplateSelect,
    });
  }

  async update(organizationId: string, id: string, dto: CreateTemplateDto) {
    const current = await this.prisma.whatsAppTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Template não encontrado.');
    const input = templateInputSchema.safeParse(dto);
    if (!input.success)
      throw new BadRequestException(input.error.issues.map((issue) => issue.message));
    if (current.origin === TemplateOrigin.META) {
      if (!current.metaTemplateId) throw new BadRequestException('Template Meta sem ID oficial.');
      if (input.data.name !== current.name || input.data.language !== current.language) {
        throw new BadRequestException(
          'Nome e idioma de template Meta não são alterados por este endpoint.',
        );
      }
      await this.meta.updateTemplate(current.metaTemplateId, {
        category: input.data.category.toLowerCase(),
        components: input.data.components,
      });
    }
    return this.prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        name: input.data.name,
        language: input.data.language,
        category: TemplateCategory.MARKETING,
        parameterFormat: input.data.parameterFormat,
        components: input.data.components,
        ttl: input.data.ttl,
        status: current.origin === TemplateOrigin.META ? TemplateStatus.PENDING : current.status,
      },
      select: publicTemplateSelect,
    });
  }

  async remove(organizationId: string, id: string) {
    const current = await this.prisma.whatsAppTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Template não encontrado.');
    if (current.origin === TemplateOrigin.META) {
      if (!current.metaTemplateId) throw new BadRequestException('Template Meta sem ID oficial.');
      await this.meta.deleteTemplate(current.metaTemplateId);
    }
    await this.prisma.whatsAppTemplate.delete({ where: { id } });
    return { success: true };
  }

  async sync(organizationId: string) {
    const rawTemplates = await this.meta.listTemplates();
    let synced = 0;
    const rejected: string[] = [];
    for (const raw of rawTemplates) {
      const parsed = providerTemplateSchema.safeParse(raw);
      if (!parsed.success) {
        rejected.push(parsed.error.issues.map((issue) => issue.path.join('.')).join(', '));
        continue;
      }
      await this.persistProviderTemplate(organizationId, parsed.data, raw);
      synced += 1;
    }
    return { synced, rejected: rejected.length, rejectedSamples: rejected.slice(0, 5) };
  }

  private async persistProviderTemplate(
    organizationId: string,
    template: z.infer<typeof providerTemplateSchema>,
    raw: unknown,
  ) {
    const existing = template.id
      ? await this.prisma.whatsAppTemplate.findUnique({
          where: {
            organizationId_metaTemplateId: { organizationId, metaTemplateId: template.id },
          },
        })
      : await this.prisma.whatsAppTemplate.findUnique({
          where: {
            organizationId_name_language: {
              organizationId,
              name: template.name,
              language: template.language,
            },
          },
        });
    const data = {
      metaTemplateId: template.id ?? existing?.metaTemplateId,
      name: template.name,
      language: template.language,
      status: mapStatus(template.status),
      category: mapCategory(template.category),
      parameterFormat: mapParameterFormat(template.parameter_format),
      components: safeProviderPayload(template.components ?? []) as Prisma.InputJsonValue,
      qualityRating:
        typeof template.quality_score === 'string'
          ? template.quality_score
          : template.quality_score
            ? JSON.stringify(template.quality_score)
            : null,
      origin: TemplateOrigin.META,
      ttl: template.message_send_ttl_seconds,
      providerUpdatedAt: template.last_updated_time
        ? new Date(template.last_updated_time)
        : undefined,
      lastSyncedAt: new Date(),
      rawProviderPayload: safeProviderPayload(raw) as Prisma.InputJsonValue,
    };
    return existing
      ? this.prisma.whatsAppTemplate.update({ where: { id: existing.id }, data })
      : this.prisma.whatsAppTemplate.create({ data: { organizationId, ...data } });
  }
}
