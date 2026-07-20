import { TemplateCategory, TemplateStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { validateCampaignTemplate } from './campaign-policy';

describe('campaign policy', () => {
  it('accepts an approved marketing template', () => {
    expect(
      validateCampaignTemplate({ status: TemplateStatus.APPROVED, category: TemplateCategory.MARKETING }),
    ).toEqual([]);
  });

  it('rejects a utility template', () => {
    expect(
      validateCampaignTemplate({ status: TemplateStatus.APPROVED, category: TemplateCategory.UTILITY }),
    ).toContain('O MVP aceita apenas templates da categoria MARKETING em campanhas.');
  });
});
