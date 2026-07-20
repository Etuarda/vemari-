import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditResult } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser, hasPermission, Permission } from '@vemari/contracts';
import { AuditService } from '../../modules/audit/audit.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<
      FastifyRequest & { user?: AuthenticatedUser }
    >();
    const user = request.user;
    const allowed = Boolean(
      user && required.every((permission) => hasPermission(user.role, permission)),
    );
    if (allowed) return true;

    if (user) {
      await this.audit.write({
        organizationId: user.organizationId,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTHORIZATION_DENIED',
        resourceType: 'HTTP_ENDPOINT',
        resourceId: request.routeOptions?.url ?? request.url,
        result: AuditResult.DENIED,
        reason: `Permissões exigidas: ${required.join(', ')}`,
        requestId: request.id,
        correlationId: String(request.headers['x-correlation-id'] ?? request.id),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
    throw new ForbiddenException('Você não possui permissão para executar esta ação.');
  }
}
