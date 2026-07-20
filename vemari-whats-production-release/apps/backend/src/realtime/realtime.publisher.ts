import { Injectable } from '@nestjs/common';
import { REALTIME_CHANNEL, RealtimeEvent } from '@vemari/contracts';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RealtimePublisher {
  constructor(private readonly redis: RedisService) {}

  publish(organizationId: string, event: string, payload: unknown) {
    const message: RealtimeEvent = {
      organizationId,
      event,
      payload,
      occurredAt: new Date().toISOString(),
    };
    return this.redis.publisher.publish(REALTIME_CHANNEL, JSON.stringify(message));
  }
}
