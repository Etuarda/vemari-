import { describe, expect, it } from 'vitest';
import { normalizePhoneE164 } from './contacts.service';

describe('normalizePhoneE164', () => {
  it('normalizes a Brazilian mobile number', () => {
    expect(normalizePhoneE164('(89) 99919-6771')).toBe('+5589999196771');
  });

  it('keeps an international E.164 number', () => {
    expect(normalizePhoneE164('+351912345678')).toBe('+351912345678');
  });
});
