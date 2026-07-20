import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequests = new Counter({
    name: 'vemari_http_requests_total',
    help: 'Quantidade de requisições HTTP.',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly httpDuration = new Histogram({
    name: 'vemari_http_request_duration_seconds',
    help: 'Duração das requisições HTTP.',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'vemari_' });
  }
}
