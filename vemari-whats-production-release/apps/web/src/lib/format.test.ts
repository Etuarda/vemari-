import { describe, expect, it } from 'vitest';
import { formatMetric, maskPhone } from './format';

describe('formatadores de apresentação', () => {
  it('formata números no padrão brasileiro', () => {
    expect(formatMetric(1234)).toBe('1.234');
  });

  it('mascara telefone sem expor o número completo', () => {
    expect(maskPhone('+5589999999999')).toBe('+55 ••••• 9999');
  });
});
