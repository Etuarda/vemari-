import { describe, expect, it } from 'vitest';
import { MessageStatus, MessageType, RecipientStatus } from '@prisma/client';
import { mapMessageType, mapStatus } from './status-mapping';

describe('mapeamento de eventos Meta', () => {
  it('mapeia status de entrega para os estados internos', () => {
    expect(mapStatus('delivered')).toEqual({
      message: MessageStatus.DELIVERED,
      recipient: RecipientStatus.DELIVERED,
      dateField: 'deliveredAt',
    });
    expect(mapStatus('desconhecido')).toBeNull();
  });

  it('mapeia tipos recebidos sem inventar suporte', () => {
    expect(mapMessageType('text')).toBe(MessageType.TEXT);
    expect(mapMessageType('sticker')).toBe(MessageType.UNKNOWN);
  });
});
