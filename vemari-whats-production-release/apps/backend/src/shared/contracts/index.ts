export enum Role {
  ADMIN = 'ADMIN',
  MARKETING_MANAGER = 'MARKETING_MANAGER',
  SUPERVISOR = 'SUPERVISOR',
  ATTENDANT = 'ATTENDANT',
  READ_ONLY = 'READ_ONLY',
}

export enum Permission {
  USER_READ = 'USER_READ',
  USER_MANAGE = 'USER_MANAGE',
  META_INTEGRATION_READ = 'META_INTEGRATION_READ',
  META_INTEGRATION_MANAGE = 'META_INTEGRATION_MANAGE',
  CONTACT_READ = 'CONTACT_READ',
  CONTACT_MANAGE = 'CONTACT_MANAGE',
  CONSENT_MANAGE = 'CONSENT_MANAGE',
  SUPPRESSION_READ = 'SUPPRESSION_READ',
  SUPPRESSION_REMOVE = 'SUPPRESSION_REMOVE',
  TEMPLATE_READ = 'TEMPLATE_READ',
  TEMPLATE_SYNC = 'TEMPLATE_SYNC',
  CAMPAIGN_READ = 'CAMPAIGN_READ',
  CAMPAIGN_CREATE = 'CAMPAIGN_CREATE',
  CAMPAIGN_SEND = 'CAMPAIGN_SEND',
  CONVERSATION_READ_ALL = 'CONVERSATION_READ_ALL',
  CONVERSATION_READ_ASSIGNED = 'CONVERSATION_READ_ASSIGNED',
  CONVERSATION_ASSIGN = 'CONVERSATION_ASSIGN',
  CONVERSATION_REPLY = 'CONVERSATION_REPLY',
  CONVERSATION_CLOSE = 'CONVERSATION_CLOSE',
  AUDIT_READ = 'AUDIT_READ',
  AUDIT_EXPORT = 'AUDIT_EXPORT',
  ANALYTICS_READ = 'ANALYTICS_READ',
}

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.MARKETING_MANAGER]: [
    Permission.META_INTEGRATION_READ,
    Permission.CONTACT_READ,
    Permission.CONTACT_MANAGE,
    Permission.CONSENT_MANAGE,
    Permission.SUPPRESSION_READ,
    Permission.TEMPLATE_READ,
    Permission.TEMPLATE_SYNC,
    Permission.CAMPAIGN_READ,
    Permission.CAMPAIGN_CREATE,
    Permission.CAMPAIGN_SEND,
    Permission.ANALYTICS_READ,
  ],
  [Role.SUPERVISOR]: [
    Permission.USER_READ,
    Permission.CONTACT_READ,
    Permission.CONSENT_MANAGE,
    Permission.SUPPRESSION_READ,
    Permission.CAMPAIGN_READ,
    Permission.CONVERSATION_READ_ALL,
    Permission.CONVERSATION_READ_ASSIGNED,
    Permission.CONVERSATION_ASSIGN,
    Permission.CONVERSATION_REPLY,
    Permission.CONVERSATION_CLOSE,
    Permission.ANALYTICS_READ,
  ],
  [Role.ATTENDANT]: [
    Permission.CONTACT_READ,
    Permission.CONVERSATION_READ_ASSIGNED,
    Permission.CONVERSATION_ASSIGN,
    Permission.CONVERSATION_REPLY,
    Permission.CONVERSATION_CLOSE,
    Permission.ANALYTICS_READ,
  ],
  [Role.READ_ONLY]: [
    Permission.CONTACT_READ,
    Permission.CAMPAIGN_READ,
    Permission.TEMPLATE_READ,
    Permission.ANALYTICS_READ,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const QUEUE_NAMES = {
  CAMPAIGN_DISPATCH: 'campaign.dispatch',
  WHATSAPP_OUTBOUND: 'whatsapp.outbound',
  WHATSAPP_WEBHOOK: 'whatsapp.webhook',
  CONTACT_IMPORT: 'contact.import',
  ANALYTICS_AGGREGATE: 'analytics.aggregate',
  DEAD_LETTER: 'dead-letter',
} as const;

export const REALTIME_CHANNEL = 'vemari:realtime-events';

export type AccessTokenPayload = {
  sub: string;
  organizationId: string;
  email: string;
  role: Role;
  type: 'access';
};

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
};

export type RealtimeEvent = {
  organizationId: string;
  event: string;
  payload: unknown;
  occurredAt: string;
};

export type CampaignDispatchJob = {
  organizationId: string;
  campaignRunId: string;
};

export type OutboundTemplateJob = {
  kind: 'MARKETING_TEMPLATE';
  organizationId: string;
  campaignRecipientId: string;
};

export type OutboundTextJob = {
  kind: 'SERVICE_TEXT';
  organizationId: string;
  messageId: string;
};

export type OutboundJob = OutboundTemplateJob | OutboundTextJob;

export type WebhookJob = {
  organizationId: string;
  webhookEventId: string;
};
