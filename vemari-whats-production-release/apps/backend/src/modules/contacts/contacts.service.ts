import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsentStatus, Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateContactDto,
  CreateSuppressionDto,
  RegisterConsentDto,
} from './contacts.dto';

export function normalizePhoneE164(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15) {
    throw new BadRequestException(`Telefone inválido: ${input}`);
  }
  return `+${digits}`;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, filters: { search?: string; status?: ConsentStatus; take?: number; cursor?: string }) {
    return this.prisma.contact.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(filters.status ? { marketingStatus: filters.status } : {}),
        ...(filters.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { phoneE164: { contains: filters.search } },
                { email: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        suppressions: { where: { liftedAt: null }, select: { id: true, reason: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.take ?? 50, 200),
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
  }

  async create(organizationId: string, createdByUserId: string, dto: CreateContactDto) {
    try {
      return await this.prisma.contact.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          phoneE164: normalizePhoneE164(dto.phone),
          email: dto.email?.trim().toLowerCase(),
          source: dto.source?.trim(),
          ...(dto.customFields !== undefined
            ? { customFields: dto.customFields as Prisma.InputJsonValue }
            : {}),
          createdByUserId,
          marketingStatus: ConsentStatus.UNKNOWN,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Já existe um contato com este telefone.');
      throw error;
    }
  }

  async registerConsent(
    organizationId: string,
    contactId: string,
    createdByUserId: string,
    dto: RegisterConsentDto,
    ipAddress?: string,
  ) {
    const contact = await this.findOrThrow(organizationId, contactId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.consentRecord.create({
        data: {
          organizationId,
          contactId,
          status: dto.status,
          purpose: dto.purpose,
          channel: dto.channel,
          source: dto.source,
          evidence: dto.evidence,
          termVersion: dto.termVersion,
          grantedAt: dto.status === ConsentStatus.OPTED_IN ? now : null,
          revokedAt:
            dto.status === ConsentStatus.OPTED_OUT || dto.status === ConsentStatus.BLOCKED
              ? now
              : null,
          createdByUserId,
          ipAddress,
        },
      });
      await tx.contact.update({
        where: { id: contact.id },
        data: { marketingStatus: dto.status },
      });
      if (dto.status === ConsentStatus.OPTED_OUT || dto.status === ConsentStatus.BLOCKED) {
        await tx.suppressionEntry.create({
          data: {
            organizationId,
            contactId,
            reason: `Consentimento alterado para ${dto.status}`,
            source: dto.source,
            createdByUserId,
          },
        });
      }
      return record;
    });
  }

  async suppress(
    organizationId: string,
    contactId: string,
    createdByUserId: string,
    dto: CreateSuppressionDto,
  ) {
    await this.findOrThrow(organizationId, contactId);
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.suppressionEntry.create({
        data: { organizationId, contactId, createdByUserId, reason: dto.reason, source: dto.source },
      });
      await tx.contact.update({ where: { id: contactId }, data: { marketingStatus: ConsentStatus.BLOCKED } });
      return entry;
    });
  }

  async liftSuppression(
    organizationId: string,
    suppressionId: string,
    liftedByUserId: string,
  ) {
    const entry = await this.prisma.suppressionEntry.findFirst({
      where: { id: suppressionId, organizationId, liftedAt: null },
    });
    if (!entry) throw new NotFoundException('Registro de supressão não encontrado.');
    return this.prisma.suppressionEntry.update({
      where: { id: entry.id },
      data: { liftedAt: new Date(), liftedByUserId },
    });
  }

  listSuppressions(organizationId: string) {
    return this.prisma.suppressionEntry.findMany({
      where: { organizationId, liftedAt: null },
      include: { contact: { select: { id: true, name: true, phoneE164: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async importCsv(organizationId: string, createdByUserId: string, buffer: Buffer) {
    let rows: Array<Record<string, string>>;
    try {
      rows = parse(buffer, {
        columns: (header: string[]) => header.map((value) => value.trim().toLowerCase()),
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        delimiter: [',', ';'],
      }) as unknown as Array<Record<string, string>>;
    } catch (error) {
      throw new BadRequestException(`CSV inválido: ${error instanceof Error ? error.message : 'erro de leitura'}`);
    }

    if (rows.length > 50_000) throw new BadRequestException('O CSV excede o limite de 50.000 linhas por importação.');
    const report = { total: rows.length, created: 0, updated: 0, rejected: 0, errors: [] as Array<{ row: number; reason: string }> };

    for (const [index, row] of rows.entries()) {
      try {
        const name = row.name ?? row.nome;
        const phone = row.phone ?? row.telefone ?? row.whatsapp;
        if (!name || !phone) throw new Error('Colunas nome/name e telefone/phone são obrigatórias.');
        const phoneE164 = normalizePhoneE164(phone);
        const existing = await this.prisma.contact.findUnique({
          where: { organizationId_phoneE164: { organizationId, phoneE164 } },
        });
        if (existing) {
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              name: name.trim(),
              email: (row.email || undefined)?.trim().toLowerCase(),
              source: row.source ?? row.origem ?? 'CSV',
            },
          });
          report.updated += 1;
        } else {
          await this.prisma.contact.create({
            data: {
              organizationId,
              name: name.trim(),
              phoneE164,
              email: (row.email || undefined)?.trim().toLowerCase(),
              source: row.source ?? row.origem ?? 'CSV',
              createdByUserId,
              marketingStatus: ConsentStatus.UNKNOWN,
            },
          });
          report.created += 1;
        }
      } catch (error) {
        report.rejected += 1;
        if (report.errors.length < 500) {
          report.errors.push({ row: index + 2, reason: error instanceof Error ? error.message : 'Erro desconhecido' });
        }
      }
    }
    return report;
  }

  private async findOrThrow(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!contact) throw new NotFoundException('Contato não encontrado.');
    return contact;
  }
}
