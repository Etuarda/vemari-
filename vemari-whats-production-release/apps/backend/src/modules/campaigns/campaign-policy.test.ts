import { TemplateCategory, TemplateOrigin, TemplateStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { validateCampaignTemplate } from './campaign-policy';

describe('campaign policy', () => {
  it('accepts an approved marketing template', () => {
    expect(
      validateCampaignTemplate({
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.MARKETING,
        origin: TemplateOrigin.META,
      }),
    ).toEqual([]);
  });

  it('rejects a utility template', () => {
    expect(
      validateCampaignTemplate({
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.UTILITY,
        origin: TemplateOrigin.META,
      }),
    ).toContain('O MVP aceita apenas templates da categoria MARKETING em campanhas.');
  });

  it('rejects a template that is not approved', () => {
    expect(
      validateCampaignTemplate({
        status: TemplateStatus.REJECTED,
        category: TemplateCategory.MARKETING,
        origin: TemplateOrigin.META,
      }),
    ).toContain('O template precisa estar aprovado pela Meta.');
  });

  it('rejects a simulated template origin', () => {
    expect(
      validateCampaignTemplate({
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.MARKETING,
        origin: TemplateOrigin.SIMULATOR,
      }),
    ).toContain('Templates simulados não podem ser usados em envios reais.');
  });
});
