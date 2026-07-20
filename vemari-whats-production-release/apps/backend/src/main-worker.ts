import 'dotenv/config';
import { Job, Queue, Worker } from 'bullmq';
import {
  CampaignDispatchJob,
  OutboundJob,
  QUEUE_NAMES,
  WebhookJob,
} from '@vemari/contracts';
import { appConfig } from './shared/config';
import { logger, prisma, publisher, redis } from './workers/lib/runtime';
import { processCampaignDispatch } from './workers/processors/campaign.processor';
import { processOutbound } from './workers/processors/outbound.processor';
import { processWebhook } from './workers/processors/webhook.processor';
import { completedJobs, failedJobs, startOperationsServer } from './workers/operations';

const deadLetter = new Queue(QUEUE_NAMES.DEAD_LETTER, { connection: redis });

function attachFailureHandler(worker: Worker) {
  worker.on('failed', (job: Job | undefined, error: Error) => {
    void (async () => {
      failedJobs.inc({ queue: worker.name });
      logger.error({ queue: worker.name, jobId: job?.id, error: error.message }, 'Job falhou');
      if (!job) return;
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade >= attempts) {
        await deadLetter.add(
          worker.name,
          {
            sourceQueue: worker.name,
            sourceJobId: job.id,
            payload: job.data,
            failedReason: error.message,
            attemptsMade: job.attemptsMade,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: false, removeOnFail: false },
        );
      }
    })();
  });
  worker.on('completed', () => completedJobs.inc({ queue: worker.name }));
  worker.on('error', (error) => logger.error({ queue: worker.name, error }, 'Erro no worker'));
}

const campaignWorker = new Worker<CampaignDispatchJob>(
  QUEUE_NAMES.CAMPAIGN_DISPATCH,
  processCampaignDispatch,
  { connection: redis, concurrency: 2, lockDuration: 120_000 },
);
const outboundWorker = new Worker<OutboundJob>(
  QUEUE_NAMES.WHATSAPP_OUTBOUND,
  processOutbound,
  {
    connection: redis,
    concurrency: appConfig.OUTBOUND_CONCURRENCY,
    lockDuration: 120_000,
    limiter: { max: 80, duration: 1000 },
  },
);
const webhookWorker = new Worker<WebhookJob>(
  QUEUE_NAMES.WHATSAPP_WEBHOOK,
  processWebhook,
  { connection: redis, concurrency: 10, lockDuration: 120_000 },
);

[campaignWorker, outboundWorker, webhookWorker].forEach(attachFailureHandler);
const operationsServerPromise = startOperationsServer();
logger.info('Workers iniciados.');

async function shutdown(signal: string) {
  logger.info({ signal }, 'Encerrando workers');
  const operationsServer = await operationsServerPromise;
  await operationsServer.close();
  await Promise.all([
    campaignWorker.close(),
    outboundWorker.close(),
    webhookWorker.close(),
    deadLetter.close(),
  ]);
  await prisma.$disconnect();
  await redis.quit();
  await publisher.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
