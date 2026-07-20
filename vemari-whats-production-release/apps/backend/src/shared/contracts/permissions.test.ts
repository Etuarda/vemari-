import { describe, expect, it } from 'vitest';
import { hasPermission, Permission, Role } from './index';

describe('RBAC', () => {
  it('allows administrators to manage users', () => {
    expect(hasPermission(Role.ADMIN, Permission.USER_MANAGE)).toBe(true);
  });

  it('does not allow attendants to send campaigns', () => {
    expect(hasPermission(Role.ATTENDANT, Permission.CAMPAIGN_SEND)).toBe(false);
  });

  it('allows attendants to reply to assigned conversations', () => {
    expect(hasPermission(Role.ATTENDANT, Permission.CONVERSATION_REPLY)).toBe(true);
  });
});
