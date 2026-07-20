import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentAction,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Role,
} from '@prisma/client';
import type { AuthenticatedUser } from '@vemari/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { RealtimePublisher } from '../../realtime/realtime.publisher';
import { AssignConversationDto, InternalNoteDto, SendMessageDto } from './conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly realtime: RealtimePublisher,
  ) {}

  list(user: AuthenticatedUser, status?: ConversationStatus) {
    const attendantScope = user.role === Role.ATTENDANT
      ? {
          OR: [
            { assignedUserId: user.id },
            { assignedUserId: null, status: { in: [ConversationStatus.UNASSIGNED, ConversationStatus.WAITING] } },
          ],
        }
      : {};
    return this.prisma.conversation.findMany({
      where: {
        organizationId: user.organizationId,
        ...(status ? { status } : {}),
        ...attendantScope,
      },
      include: {
        contact: { select: { id: true, name: true, phoneE164: true, marketingStatus: true } },
        assignedUser: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ priority: 'desc' }, { lastMessageAt: 'desc' }],
      take: 200,
    });
  }

  async messages(user: AuthenticatedUser, conversationId: string, cursor?: string) {
    const conversation = await this.findAccessible(user, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async assign(user: AuthenticatedUser, conversationId: string, dto: AssignConversationDto) {
    const conversation = await this.findAccessible(user, conversationId);
    if (user.role === Role.ATTENDANT && dto.userId !== user.id) {
      throw new ForbiddenException('Atendentes só podem assumir conversas para si próprios.');
    }
    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: user.organizationId, status: 'ACTIVE' },
    });
    if (!assignee) throw new NotFoundException('Atendente não encontrado.');

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.conversation.updateMany({
        where: { id: conversationId, organizationId: user.organizationId, version: dto.version },
        data: {
          assignedUserId: dto.userId,
          status: ConversationStatus.IN_PROGRESS,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new ConflictException('A conversa foi alterada por outro usuário. Atualize a tela.');
      await tx.conversationAssignment.create({
        data: {
          conversationId,
          action: conversation.assignedUserId ? AssignmentAction.TRANSFERRED : AssignmentAction.ASSIGNED,
          fromUserId: conversation.assignedUserId,
          toUserId: dto.userId,
          performedByUserId: user.id,
          note: dto.note,
        },
      });
      return tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { assignedUser: { select: { id: true, name: true, email: true } }, contact: true },
      });
    });
    await this.realtime.publish(user.organizationId, 'conversation.assigned', result);
    return result;
  }

  async sendMessage(user: AuthenticatedUser, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.findAccessible(user, conversationId);
    if (conversation.assignedUserId !== user.id && user.role === Role.ATTENDANT) {
      throw new ForbiddenException('Assuma a conversa antes de responder.');
    }
    const windowOpen = conversation.lastInboundAt && Date.now() - conversation.lastInboundAt.getTime() <= 24 * 60 * 60 * 1000;
    if (!windowOpen) {
      throw new BadRequestException({
        code: 'CUSTOMER_SERVICE_WINDOW_CLOSED',
        message: 'A janela de atendimento de 24 horas está fechada. Use um template aprovado.',
      });
    }

    const message = await this.prisma.message.create({
      data: {
        organizationId: user.organizationId,
        conversationId,
        contactId: conversation.contactId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        status: MessageStatus.PENDING,
        senderUserId: user.id,
        content: dto.content.trim(),
      },
    });
    await this.queues.whatsappOutbound.add(
      'service-text',
      { kind: 'SERVICE_TEXT', organizationId: user.organizationId, messageId: message.id },
      {
        jobId: `message:${message.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 86_400, count: 20_000 },
        removeOnFail: { age: 604_800, count: 20_000 },
      },
    );
    await this.realtime.publish(user.organizationId, 'message.created', message);
    return message;
  }

  async internalNote(user: AuthenticatedUser, conversationId: string, dto: InternalNoteDto) {
    const conversation = await this.findAccessible(user, conversationId);
    const note = await this.prisma.message.create({
      data: {
        organizationId: user.organizationId,
        conversationId,
        contactId: conversation.contactId,
        direction: MessageDirection.INTERNAL,
        type: MessageType.INTERNAL_NOTE,
        status: MessageStatus.RECEIVED,
        senderUserId: user.id,
        content: dto.content.trim(),
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    await this.realtime.publish(user.organizationId, 'message.created', note);
    return note;
  }

  async close(user: AuthenticatedUser, conversationId: string) {
    const conversation = await this.findAccessible(user, conversationId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.CLOSED, closedAt: new Date(), version: { increment: 1 } },
      });
      await tx.conversationAssignment.create({
        data: {
          conversationId,
          action: AssignmentAction.CLOSED,
          fromUserId: conversation.assignedUserId,
          performedByUserId: user.id,
        },
      });
      return result;
    });
    await this.realtime.publish(user.organizationId, 'conversation.closed', updated);
    return updated;
  }

  private async findAccessible(user: AuthenticatedUser, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { contact: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada.');
    if (
      user.role === Role.ATTENDANT &&
      conversation.assignedUserId &&
      conversation.assignedUserId !== user.id
    ) {
      throw new ForbiddenException('Esta conversa está atribuída a outro atendente.');
    }
    return conversation;
  }
}
