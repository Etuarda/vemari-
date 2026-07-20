import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditResult, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type WriteAuditInput = {
  organizationId: string;
  actorUserId?: string;
  actorEmail?: string;
  actorRole?: Role;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: AuditResult;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  reason?: string;
  requestId?: string;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  write(input: WriteAuditInput) {
    const retentionDays = this.config.get<number>('AUDIT_RETENTION_DAYS', 1825);
    const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000);
    return this.prisma.auditLog.create({
      data: {
        ...input,
        retentionUntil,
      },
    });
  }

  list(organizationId: string, filters: {
    actorUserId?: string;
    action?: string;
    resourceType?: string;
    result?: AuditResult;
    from?: Date;
    to?: Date;
    take?: number;
    cursor?: string;
  }) {
    return this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
        ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' } } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(filters.result ? { result: filters.result } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.take ?? 100, 500),
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
  }
}
