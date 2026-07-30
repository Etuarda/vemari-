import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type MetaClientConfig = {
  graphApiVersion: string;
  accessToken: string;
  appSecret: string;
  wabaId: string;
  phoneNumberId: string;
  timeoutMs?: number;
  useMarketingMessagesApi?: boolean;
};

export type TemplateComponentParameter =
  | { type: 'text'; text: string; parameter_name?: string }
  | { type: 'image'; image: { link: string } }
  | { type: 'document'; document: { link: string; filename?: string } };

export type SendTemplateInput = {
  to: string;
  templateName: string;
  languageCode: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    sub_type?: 'url' | 'quick_reply';
    index?: string;
    parameters: TemplateComponentParameter[];
  }>;
  forceCloudApi?: boolean;
};

export type SendTextInput = {
  to: string;
  text: string;
  previewUrl?: boolean;
};

export type MetaMessageResult = {
  messageId: string;
  waId?: string;
};

export type ProviderFailureCertainty = 'NOT_ACCEPTED' | 'AMBIGUOUS';

export interface OutboundProvider {
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<MetaMessageResult>;
  sendText(input: SendTextInput): Promise<MetaMessageResult>;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly isTransient = false,
    public readonly details?: unknown,
    public readonly failureCertainty: ProviderFailureCertainty = 'NOT_ACCEPTED',
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

const metaErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    is_transient: z.boolean().optional(),
    error_data: z.unknown().optional(),
  }),
});

export function createAppSecretProof(accessToken: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=') || !appSecret) return false;
  const suppliedHex = signatureHeader.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export class MetaWhatsAppClient {
  readonly name = 'META_CLOUD_API';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: MetaClientConfig) {
    this.baseUrl = `https://graph.facebook.com/${config.graphApiVersion}`;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.accessToken &&
      this.config.appSecret &&
      this.config.wabaId &&
      this.config.phoneNumberId,
    );
  }

  canManageTemplates(): boolean {
    return Boolean(this.config.accessToken && this.config.wabaId);
  }

  async createTemplate(payload: unknown): Promise<unknown> {
    if (!this.canManageTemplates()) {
      throw new MetaApiError('WABA ou token da Meta não configurado.', 503);
    }
    return this.request(
      `/${this.config.wabaId}/message_templates`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      true,
    );
  }

  async updateTemplate(templateId: string, payload: unknown): Promise<unknown> {
    return this.request(`/${templateId}`, { method: 'POST', body: JSON.stringify(payload) }, true);
  }

  async deleteTemplate(templateId: string): Promise<unknown> {
    return this.request(`/${templateId}`, { method: 'DELETE' }, true);
  }

  async sendTemplate(input: SendTemplateInput): Promise<MetaMessageResult> {
    const useMarketingEndpoint =
      this.config.useMarketingMessagesApi === true && input.forceCloudApi !== true;
    const endpoint = useMarketingEndpoint ? 'marketing_messages' : 'messages';

    const response = await this.request<{
      contacts?: Array<{ wa_id?: string }>;
      messages?: Array<{ id: string }>;
    }>(`/${this.config.phoneNumberId}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          ...(input.components?.length ? { components: input.components } : {}),
        },
      }),
    });

    const messageId = response.messages?.[0]?.id;
    if (!messageId) throw new MetaApiError('A Meta não retornou o identificador da mensagem.', 502);
    const waId = response.contacts?.[0]?.wa_id;
    return waId ? { messageId, waId } : { messageId };
  }

  async sendText(input: SendTextInput): Promise<MetaMessageResult> {
    const response = await this.request<{
      contacts?: Array<{ wa_id?: string }>;
      messages?: Array<{ id: string }>;
    }>(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.to,
        type: 'text',
        text: { body: input.text, preview_url: input.previewUrl ?? false },
      }),
    });

    const messageId = response.messages?.[0]?.id;
    if (!messageId) throw new MetaApiError('A Meta não retornou o identificador da mensagem.', 502);
    const waId = response.contacts?.[0]?.wa_id;
    return waId ? { messageId, waId } : { messageId };
  }

  async listTemplates(): Promise<unknown[]> {
    const result = await this.request<{ data?: unknown[] }>(
      `/${this.config.wabaId}/message_templates?fields=id,name,status,category,language,parameter_format,components,quality_score,message_send_ttl_seconds,last_updated_time&limit=250`,
      { method: 'GET' },
      true,
    );
    return result.data ?? [];
  }

  async getPhoneStatus(): Promise<unknown> {
    return this.request(
      `/${this.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      { method: 'GET' },
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    templateManagementRequest = false,
  ): Promise<T> {
    if (templateManagementRequest ? !this.canManageTemplates() : !this.isConfigured()) {
      throw new MetaApiError('Integração Meta não configurada.', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const separator = path.includes('?') ? '&' : '?';
    const proofQuery = this.config.appSecret
      ? `${separator}appsecret_proof=${createAppSecretProof(this.config.accessToken, this.config.appSecret)}`
      : '';
    const url = `${this.baseUrl}${path}${proofQuery}`;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });

      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const parsed = metaErrorSchema.safeParse(body);
        if (parsed.success) {
          const error = parsed.data.error;
          throw new MetaApiError(
            error.message,
            response.status,
            error.code,
            error.error_subcode,
            error.is_transient ?? response.status >= 500,
            error.error_data,
            response.status >= 500 ? 'AMBIGUOUS' : 'NOT_ACCEPTED',
          );
        }
        throw new MetaApiError(
          `Erro HTTP ${response.status} na Graph API.`,
          response.status,
          undefined,
          undefined,
          response.status >= 500 || response.status === 429,
          body,
          response.status >= 500 ? 'AMBIGUOUS' : 'NOT_ACCEPTED',
        );
      }
      return body as T;
    } catch (error) {
      if (error instanceof MetaApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MetaApiError(
          'Tempo limite excedido ao chamar a Graph API.',
          504,
          undefined,
          undefined,
          true,
          undefined,
          'AMBIGUOUS',
        );
      }
      throw new MetaApiError(
        'Falha de comunicação com a Graph API.',
        502,
        undefined,
        undefined,
        true,
        error,
        'AMBIGUOUS',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
