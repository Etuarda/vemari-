import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const redis = await this.redis.client.ping();
      if (redis !== 'PONG') throw new Error('Redis indisponível');
      return { status: 'ready', database: 'ok', redis: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Dependências indisponíveis.');
    }
  }
}
