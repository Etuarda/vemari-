import { createHash, randomBytes } from 'node:crypto';

export const ACTIVATION_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_INVITATION_TTL_MS = 30 * 60 * 1000;

export function createInvitationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
