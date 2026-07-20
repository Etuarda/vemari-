import { SetMetadata } from '@nestjs/common';

export type AuditActionMetadata = {
  action: string;
  resourceType: string;
};

export const AUDIT_ACTION_KEY = 'auditAction';
export const AuditAction = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, resourceType } satisfies AuditActionMetadata);
