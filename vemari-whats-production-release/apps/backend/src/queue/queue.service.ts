import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  CampaignDispatchJob,
  OutboundJob,
  QUEUE_NAMES,
  WebhookJob,
} from '@vemari/contracts';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly campaignDispatch: Queue<CampaignDispatchJob>;
  readonly whatsappOutbound: Queue<OutboundJob>;
  readonly whatsappWebhook: Queue<WebhookJob>;
  readonly deadLetter: Queue;

  constructor(redis: RedisService) {
    const connection = redis.client;
    this.campaignDispatch = new Queue(QUEUE_NAMES.CAMPAIGN_DISPATCH, { connection });
    this.whatsappOutbound = new Queue(QUEUE_NAMES.WHATSAPP_OUTBOUND, { connection });
    this.whatsappWebhook = new Queue(QUEUE_NAMES.WHATSAPP_WEBHOOK, { connection });
    this.deadLetter = new Queue(QUEUE_NAMES.DEAD_LETTER, { connection });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.campaignDispatch.close(),
      this.whatsappOutbound.close(),
      this.whatsappWebhook.close(),
      this.deadLetter.close(),
    ]);
  }
}
