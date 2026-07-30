import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebhookStatus } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyMetaSignature } from '@vemari/meta';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';

function constantTimeTextEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Controller('webhooks/whatsapp')
export class WebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN', '');
    if (!expected || mode !== 'subscribe' || !token || !constantTimeTextEqual(token, expected)) {
      throw new UnauthorizedException('Falha na verificação do webhook.');
    }
    return challenge ?? '';
  }

  @Public()
  @Post()
  async receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const rawBody = request.rawBody;
    if (!rawBody) throw new BadRequestException('Corpo bruto indisponível para validação.');
    const appSecret = this.config.get<string>('META_APP_SECRET', '');
    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      throw new UnauthorizedException('Assinatura do webhook inválida.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { slug: this.config.getOrThrow<string>('VEMARI_ORGANIZATION_SLUG') },
    });
    if (!organization) throw new BadRequestException('Organização não configurada.');

    const eventKey = createHash('sha256').update(rawBody).digest('hex');
    const existing = await this.prisma.webhookEvent.findUnique({ where: { eventKey } });
    if (existing) return { received: true, duplicate: true };

    let event;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          organizationId: organization.id,
          provider: 'META_WHATSAPP',
          eventKey,
          payload: request.body as Prisma.InputJsonValue,
          signatureValid: true,
          status: WebhookStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    await this.queues.whatsappWebhook.add(
      'process',
      { organizationId: organization.id, webhookEventId: event.id },
      {
        jobId: event.id,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800, count: 10_000 },
      },
    );

    return { received: true };
  }
}
