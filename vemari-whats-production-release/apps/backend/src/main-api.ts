import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      logger: {
        level: process.env.LOG_LEVEL ?? 'info',
        serializers: {
          req: (request: {
            method?: string;
            url?: string;
            hostname?: string;
            remoteAddress?: string;
          }) => ({
            method: request.method,
            url: request.url?.split('?')[0],
            hostname: request.hostname,
            remoteAddress: request.remoteAddress,
          }),
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            '*.password',
            '*.accessToken',
            '*.refreshToken',
          ],
          censor: '[REDACTED]',
        },
      },
      bodyLimit: 2 * 1024 * 1024,
      requestIdHeader: 'x-request-id',
    }),
    { rawBody: true, bufferLogs: true },
  );
  const config = app.get(ConfigService);
  app.useLogger(new Logger('VemariAPI'));

  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(fastifyMultipart, {
    limits: {
      files: 1,
      fileSize: config.get<number>('MAX_CSV_IMPORT_BYTES', 10_485_760),
    },
  });

  const allowedOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Correlation-Id'],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.get<string>('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Vemari Whats API')
        .setDescription('API interna de campanhas e atendimento via WhatsApp Business Platform.')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API iniciada na porta ${port}`, 'Bootstrap');
}

void bootstrap();
