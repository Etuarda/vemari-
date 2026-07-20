import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AssignConversationDto, InternalNoteDto, SendMessageDto } from './conversations.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @RequirePermissions(Permission.CONVERSATION_READ_ASSIGNED)
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: ConversationStatus) {
    return this.conversations.list(user, status);
  }

  @Get(':id/messages')
  @RequirePermissions(Permission.CONVERSATION_READ_ASSIGNED)
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversations.messages(user, id, cursor);
  }

  @Post(':id/assign')
  @RequirePermissions(Permission.CONVERSATION_ASSIGN)
  @AuditAction('CONVERSATION_ASSIGN', 'CONVERSATION')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignConversationDto,
  ) {
    return this.conversations.assign(user, id, dto);
  }

  @Post(':id/messages')
  @RequirePermissions(Permission.CONVERSATION_REPLY)
  @AuditAction('CONVERSATION_MESSAGE_SEND', 'MESSAGE')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.sendMessage(user, id, dto);
  }

  @Post(':id/internal-notes')
  @RequirePermissions(Permission.CONVERSATION_REPLY)
  @AuditAction('CONVERSATION_INTERNAL_NOTE_CREATE', 'MESSAGE')
  note(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InternalNoteDto,
  ) {
    return this.conversations.internalNote(user, id, dto);
  }

  @Post(':id/close')
  @RequirePermissions(Permission.CONVERSATION_CLOSE)
  @AuditAction('CONVERSATION_CLOSE', 'CONVERSATION')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversations.close(user, id);
  }
}
