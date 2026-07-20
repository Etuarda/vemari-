import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import pino from 'pino';
import { MetaWhatsAppClient } from '@vemari/meta';
import { appConfig } from '../../shared/config';

export const prisma = new PrismaClient();
export const redis = new IORedis(appConfig.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(1000 * 2 ** Math.min(times, 5), 20_000),
});
export const publisher = new IORedis(appConfig.REDIS_URL, { maxRetriesPerRequest: null });
export const logger = pino({
  level: appConfig.LOG_LEVEL,
  redact: {
    paths: ['*.accessToken', '*.appSecret', '*.password', '*.authorization'],
    censor: '[REDACTED]',
  },
});
export const meta = new MetaWhatsAppClient({
  graphApiVersion: appConfig.META_GRAPH_API_VERSION,
  accessToken: appConfig.META_ACCESS_TOKEN,
  appSecret: appConfig.META_APP_SECRET,
  wabaId: appConfig.META_WABA_ID,
  phoneNumberId: appConfig.META_PHONE_NUMBER_ID,
  timeoutMs: appConfig.META_HTTP_TIMEOUT_MS,
  useMarketingMessagesApi: appConfig.META_USE_MARKETING_MESSAGES_API,
});
