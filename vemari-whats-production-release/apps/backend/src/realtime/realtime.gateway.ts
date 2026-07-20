import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { REALTIME_CHANNEL, RealtimeEvent, AccessTokenPayload } from '@vemari/contracts';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token = String(client.handshake.auth?.token ?? '');
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data.user = payload;
      await client.join(`org:${payload.organizationId}`);
      await client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  async onModuleInit(): Promise<void> {
    await this.redis.subscriber.subscribe(REALTIME_CHANNEL);
    this.redis.subscriber.on('message', (channel, raw) => {
      if (channel !== REALTIME_CHANNEL) return;
      try {
        const message = JSON.parse(raw) as RealtimeEvent;
        this.server.to(`org:${message.organizationId}`).emit(message.event, message.payload);
      } catch {
        // Evento inválido é descartado; o erro permanece nos logs do publicador/worker.
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.subscriber.unsubscribe(REALTIME_CHANNEL);
  }
}
