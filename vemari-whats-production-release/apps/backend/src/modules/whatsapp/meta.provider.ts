import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppClient } from '@vemari/meta';

export const META_CLIENT = Symbol('META_CLIENT');

export const metaClientProvider = {
  provide: META_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new MetaWhatsAppClient({
      graphApiVersion: config.get<string>('META_GRAPH_API_VERSION', 'v25.0'),
      accessToken: config.get<string>('META_ACCESS_TOKEN', ''),
      appSecret: config.get<string>('META_APP_SECRET', ''),
      wabaId: config.get<string>('META_WABA_ID', ''),
      phoneNumberId: config.get<string>('META_PHONE_NUMBER_ID', ''),
      timeoutMs: config.get<number>('META_HTTP_TIMEOUT_MS', 15_000),
      useMarketingMessagesApi: config.get<boolean>('META_USE_MARKETING_MESSAGES_API', false),
    }),
};
