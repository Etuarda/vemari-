import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditResult, Role } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { catchError, Observable, tap, throwError } from 'rxjs';
import type { AuthenticatedUser } from '@vemari/contracts';
import {
  AUDIT_ACTION_KEY,
  AuditActionMetadata,
} from '../decorators/audit-action.decorator';
import { AuditService } from '../../modules/audit/audit.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'refreshToken',
  'accessToken',
  'token',
  'appSecret',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[REDACTED]' : sanitize(nested),
    ]),
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<
      FastifyRequest & { user?: AuthenticatedUser }
    >();
    if (!MUTATING_METHODS.has(request.method)) return next.handle();

    const metadata = this.reflector.getAllAndOverride<AuditActionMetadata>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const user = request.user;
    const organizationId = user?.organizationId;
    if (!organizationId) return next.handle();

    const base = {
      organizationId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role as unknown as Role,
      action: metadata?.action ?? `${request.method}_${request.routeOptions?.url ?? request.url}`,
      resourceType: metadata?.resourceType ?? 'HTTP_REQUEST',
      resourceId: (request.params as Record<string, string> | undefined)?.id,
      requestId: request.id,
      correlationId: String(request.headers['x-correlation-id'] ?? request.id),
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      previousState: undefined,
    };

    return next.handle().pipe(
      tap((responseBody) => {
        void this.audit.write({
          ...base,
          result: AuditResult.SUCCESS,
          newState: sanitize({ request: request.body, response: responseBody }) as any,
          resourceId:
            base.resourceId ??
            (responseBody && typeof responseBody === 'object' && 'id' in responseBody
              ? String((responseBody as Record<string, unknown>).id)
              : undefined),
        });
      }),
      catchError((error: unknown) => {
        void this.audit.write({
          ...base,
          result: AuditResult.FAILURE,
          reason: error instanceof Error ? error.message : 'Falha não identificada',
        });
        return throwError(() => error);
      }),
    );
  }
}
