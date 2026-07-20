import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from '@vemari/meta';

describe('verifyMetaSignature', () => {
  it('accepts a valid SHA-256 signature', () => {
    const secret = 'app-secret';
    const body = Buffer.from('{"ok":true}');
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyMetaSignature(Buffer.from('body'), `sha256=${'0'.repeat(64)}`, 'secret')).toBe(false);
  });
});
