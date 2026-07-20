import { REALTIME_CHANNEL, RealtimeEvent } from '@vemari/contracts';
import { publisher } from './runtime';

export async function publishRealtime(organizationId: string, event: string, payload: unknown) {
  const message: RealtimeEvent = {
    organizationId,
    event,
    payload,
    occurredAt: new Date().toISOString(),
  };
  await publisher.publish(REALTIME_CHANNEL, JSON.stringify(message));
}
