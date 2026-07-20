import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { finalize, Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const started = process.hrtime.bigint();
    return next.handle().pipe(
      finalize(() => {
        const route = request.routeOptions?.url ?? request.url.split('?')[0];
        const status = String(reply.statusCode);
        const labels = { method: request.method, route, status };
        this.metrics.httpRequests.inc(labels);
        this.metrics.httpDuration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
      }),
    );
  }
}
