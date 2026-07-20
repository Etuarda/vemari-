import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { AuditResult } from '@prisma/client';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';

function csvEscape(value: unknown): string {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('result') result?: AuditResult,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.list(user.organizationId, {
      actorUserId,
      action,
      resourceType,
      result,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Get('export.csv')
  @RequirePermissions(Permission.AUDIT_EXPORT)
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Req() request: FastifyRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const logs = await this.audit.list(user.organizationId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      take: 500,
    });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUDIT_EXPORT',
      resourceType: 'AUDIT_LOG',
      result: AuditResult.SUCCESS,
      reason: `Exportação CSV com ${logs.length} registros`,
      requestId: request.id,
      correlationId: String(request.headers['x-correlation-id'] ?? request.id),
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    const header = [
      'createdAt',
      'actorEmail',
      'actorRole',
      'action',
      'resourceType',
      'resourceId',
      'result',
      'reason',
      'requestId',
      'correlationId',
      'ipAddress',
    ];
    const rows = logs.map((log: Record<string, any>) =>
      [
        log.createdAt.toISOString(),
        log.actorEmail,
        log.actorRole,
        log.action,
        log.resourceType,
        log.resourceId,
        log.result,
        log.reason,
        log.requestId,
        log.correlationId,
        log.ipAddress,
      ]
        .map(csvEscape)
        .join(','),
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="audit-vemari-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return `\uFEFF${header.join(',')}\n${rows.join('\n')}`;
  }
}
