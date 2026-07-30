import { z } from 'zod';

// Meta sources:
// https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
// https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/custom-marketing-templates
export const META_TEMPLATE_DOCS = {
  overview:
    'https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview',
  customMarketing:
    'https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/custom-marketing-templates',
  api: 'https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/message-template-api',
  upload: 'https://developers.facebook.com/docs/graph-api/guides/upload',
} as const;

const namedParam = z.object({
  param_name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  example: z.string().min(1),
});

const textExample = z.object({
  body_text: z.array(z.array(z.string().min(1))).optional(),
  body_text_named_params: z.array(namedParam).optional(),
  header_text: z.array(z.string().min(1)).optional(),
  header_text_named_params: z.array(namedParam).optional(),
});

const header = z.object({
  type: z.literal('HEADER'),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']),
  text: z.string().optional(),
  example: textExample.extend({ header_handle: z.array(z.string().min(1)).optional() }).optional(),
});
const body = z.object({
  type: z.literal('BODY'),
  text: z.string().min(1),
  example: textExample.optional(),
});
const footer = z.object({ type: z.literal('FOOTER'), text: z.string().min(1) });
const button = z.discriminatedUnion('type', [
  z.object({ type: z.literal('URL'), text: z.string().min(1), url: z.string().url() }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().min(1),
    phone_number: z.string().min(1),
  }),
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().min(1) }),
]);
const buttons = z.object({ type: z.literal('BUTTONS'), buttons: z.array(button).min(1).max(10) });

export const templateInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    language: z.string().min(1),
    category: z.literal('MARKETING'),
    parameterFormat: z.enum(['NAMED', 'POSITIONAL']),
    components: z.array(z.union([header, body, footer, buttons])),
    ttl: z.number().int().positive().optional(),
  })
  .superRefine((template, context) => {
    if (template.components.filter((component) => component.type === 'BODY').length !== 1) {
      context.addIssue({ code: 'custom', message: 'O template deve ter exatamente um BODY.' });
    }
    for (const component of template.components) {
      if (component.type === 'HEADER' && component.format !== 'TEXT') {
        if (!component.example?.header_handle?.[0]) {
          context.addIssue({
            code: 'custom',
            message: 'Header de mídia exige example.header_handle.',
          });
        }
        continue;
      }
      if (component.type !== 'BODY' && component.type !== 'HEADER') continue;
      const text = component.text ?? '';
      if (template.parameterFormat === 'NAMED') validateNamed(component, text, context);
      else validatePositional(component, text, context);
    }
  });

type TextComponent = z.infer<typeof body> | z.infer<typeof header>;

function validateNamed(component: TextComponent, text: string, context: z.RefinementCtx) {
  const variables = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
  if (variables.some((name) => !/^[a-z][a-z0-9_]*$/.test(name))) {
    context.addIssue({
      code: 'custom',
      message: 'Parâmetros named devem usar lowercase e underscore.',
    });
  }
  if (new Set(variables).size !== variables.length) {
    context.addIssue({ code: 'custom', message: 'Nomes de parâmetros devem ser únicos.' });
  }
  const examples =
    component.type === 'BODY'
      ? component.example?.body_text_named_params
      : component.example?.header_text_named_params;
  const exampleNames = new Set((examples ?? []).map((item) => item.param_name));
  if (variables.some((name) => !exampleNames.has(name))) {
    context.addIssue({
      code: 'custom',
      message: 'Toda variável named exige exemplo correspondente.',
    });
  }
}

function validatePositional(component: TextComponent, text: string, context: z.RefinementCtx) {
  const rawPositions = [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
  const positions = rawPositions.map(Number);
  if (positions.some((position, index) => position !== index + 1)) {
    context.addIssue({
      code: 'custom',
      message: 'Parâmetros posicionais devem seguir a ordem 1..N.',
    });
  }
  const examples =
    component.type === 'BODY' ? component.example?.body_text?.[0] : component.example?.header_text;
  if (positions.length && examples?.length !== positions.length) {
    context.addIssue({ code: 'custom', message: 'Toda variável positional exige exemplo.' });
  }
}

export type TemplateInput = z.infer<typeof templateInputSchema>;

export function buildOfficialTemplatePayload(input: TemplateInput) {
  return {
    name: input.name,
    language: input.language,
    category: input.category.toLowerCase(),
    parameter_format: input.parameterFormat.toLowerCase(),
    components: input.components,
    ...(input.ttl ? { message_send_ttl_seconds: input.ttl } : {}),
  };
}

export function buildTemplateSendPayload(input: {
  to: string;
  name: string;
  language: string;
  parameterFormat: 'NAMED' | 'POSITIONAL';
  parameters: Record<string, string> | string[];
}) {
  const parameters =
    input.parameterFormat === 'NAMED'
      ? Object.entries(input.parameters as Record<string, string>).map(
          ([parameter_name, text]) => ({
            type: 'text' as const,
            parameter_name,
            text,
          }),
        )
      : (input.parameters as string[]).map((text) => ({ type: 'text' as const, text }));
  return {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to: input.to,
    type: 'template' as const,
    template: {
      name: input.name,
      language: { code: input.language },
      components: parameters.length ? [{ type: 'body' as const, parameters }] : [],
    },
  };
}
