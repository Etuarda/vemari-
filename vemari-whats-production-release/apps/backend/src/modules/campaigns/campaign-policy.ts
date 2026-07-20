import { TemplateCategory, TemplateStatus } from '@prisma/client';

export type CampaignTemplateInput = {
  status: TemplateStatus;
  category: TemplateCategory;
};

export function validateCampaignTemplate(template: CampaignTemplateInput): string[] {
  const errors: string[] = [];
  if (template.status !== TemplateStatus.APPROVED) {
    errors.push('O template precisa estar aprovado pela Meta.');
  }
  if (template.category !== TemplateCategory.MARKETING) {
    errors.push('O MVP aceita apenas templates da categoria MARKETING em campanhas.');
  }
  return errors;
}
