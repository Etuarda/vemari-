import Fastify from 'fastify';
import { collectDefaultMetrics, Counter, Registry } from 'prom-client';
import { appConfig } from '../shared/config';
import { logger, prisma, redis } from './lib/runtime';

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'vemari_worker_' });
export const completedJobs = new Counter({
  name: 'vemari_worker_jobs_completed_total',
  help: 'Jobs concluídos pelos workers.',
  labelNames: ['queue'],
  registers: [registry],
});
export const failedJobs = new Counter({
  name: 'vemari_worker_jobs_failed_total',
  help: 'Jobs que falharam nos workers.',
  labelNames: ['queue'],
  registers: [registry],
});

export async function startOperationsServer() {
  const app = Fastify({ logger: false });
  app.get('/health/live', () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if ((await redis.ping()) !== 'PONG') throw new Error('Redis indisponível');
      return { status: 'ready', database: 'ok', redis: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
  await app.listen({ port: appConfig.WORKER_HEALTH_PORT, host: '0.0.0.0' });
  logger.info({ port: appConfig.WORKER_HEALTH_PORT }, 'Servidor operacional do worker iniciado');
  return app;
}
