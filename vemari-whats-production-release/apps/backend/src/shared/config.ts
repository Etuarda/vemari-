import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url(),
  WEB_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  VEMARI_ORGANIZATION_SLUG: z.string().min(1).default('vemari'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  DATA_ENCRYPTION_KEY_BASE64: z.string().min(43),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default('v25.0'),
  META_APP_ID: z.string().optional().default(''),
  META_APP_SECRET: z.string().optional().default(''),
  META_BUSINESS_ID: z.string().optional().default(''),
  META_WABA_ID: z.string().optional().default(''),
  META_PHONE_NUMBER_ID: z.string().optional().default(''),
  META_ACCESS_TOKEN: z.string().optional().default(''),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),
  META_USE_MARKETING_MESSAGES_API: booleanFromString,
  META_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(365).default(1825),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PROMETHEUS_ENABLED: booleanFromString,
  MAX_CSV_IMPORT_BYTES: z.coerce.number().int().positive().default(10_485_760),
  OUTBOUND_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  CAMPAIGN_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuração inválida: ${result.error.message}`);
  }
  return result.data;
}

export const appConfig = envSchema.parse(process.env);
