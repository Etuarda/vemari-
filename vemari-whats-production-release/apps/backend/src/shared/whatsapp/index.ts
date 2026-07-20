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
  | { type: 'text'; text: string }
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

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly isTransient = false,
    public readonly details?: unknown,
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
      `/${this.config.wabaId}/message_templates?fields=id,name,status,category,language,components&limit=250`,
      { method: 'GET' },
    );
    return result.data ?? [];
  }

  async getPhoneStatus(): Promise<unknown> {
    return this.request(
      `/${this.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
      { method: 'GET' },
    );
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.isConfigured()) {
      throw new MetaApiError('Integração Meta não configurada.', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const separator = path.includes('?') ? '&' : '?';
    const appSecretProof = createAppSecretProof(this.config.accessToken, this.config.appSecret);
    const url = `${this.baseUrl}${path}${separator}appsecret_proof=${appSecretProof}`;

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
          );
        }
        throw new MetaApiError(`Erro HTTP ${response.status} na Graph API.`, response.status, undefined, undefined, response.status >= 500, body);
      }
      return body as T;
    } catch (error) {
      if (error instanceof MetaApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new MetaApiError('Tempo limite excedido ao chamar a Graph API.', 504, undefined, undefined, true);
      }
      throw new MetaApiError('Falha de comunicação com a Graph API.', 502, undefined, undefined, true, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
