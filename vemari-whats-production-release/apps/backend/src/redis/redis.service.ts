import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: IORedis;
  readonly publisher: IORedis;
  readonly subscriber: IORedis;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    const options = {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times: number) => Math.min(1000 * 2 ** Math.min(times, 5), 20_000),
    };
    this.client = new IORedis(url, options);
    this.publisher = new IORedis(url, options);
    this.subscriber = new IORedis(url, options);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }
}
