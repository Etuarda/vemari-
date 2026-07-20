import { MessageStatus, MessageType, RecipientStatus } from '@prisma/client';

export type MappedDeliveryStatus = {
  message: MessageStatus;
  recipient: RecipientStatus;
  dateField: 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt';
};

export function mapMessageType(type: string): MessageType {
  const mapping: Record<string, MessageType> = {
    text: MessageType.TEXT,
    image: MessageType.IMAGE,
    document: MessageType.DOCUMENT,
    audio: MessageType.AUDIO,
    video: MessageType.VIDEO,
    location: MessageType.LOCATION,
    interactive: MessageType.INTERACTIVE,
  };
  return mapping[type] ?? MessageType.UNKNOWN;
}

export function mapStatus(status: string): MappedDeliveryStatus | null {
  if (status === 'sent') {
    return { message: MessageStatus.SENT, recipient: RecipientStatus.SENT, dateField: 'sentAt' };
  }
  if (status === 'delivered') {
    return {
      message: MessageStatus.DELIVERED,
      recipient: RecipientStatus.DELIVERED,
      dateField: 'deliveredAt',
    };
  }
  if (status === 'read') {
    return { message: MessageStatus.READ, recipient: RecipientStatus.READ, dateField: 'readAt' };
  }
  if (status === 'failed') {
    return {
      message: MessageStatus.FAILED,
      recipient: RecipientStatus.FAILED,
      dateField: 'failedAt',
    };
  }
  return null;
}
