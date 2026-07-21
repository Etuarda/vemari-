import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USER_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.users.list(user.organizationId);
  }

  @Get('attendants')
  @RequirePermissions(Permission.CONVERSATION_ASSIGN)
  attendants(@CurrentUser() user: AuthenticatedUser) {
    return this.users.attendants(user.organizationId);
  }

  @Post()
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_CREATE', 'USER')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.organizationId, user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_UPDATE', 'USER')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user.organizationId, user.id, id, dto);
  }

  @Post(':id/invitations')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_INVITATION_CREATE', 'USER_INVITATION')
  createInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.createActivationInvitation(user.organizationId, user.id, id);
  }

  @Delete(':id/invitations')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_INVITATION_REVOKE', 'USER_INVITATION')
  revokeInvitations(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.revokeInvitations(user.organizationId, id);
  }

  @Post(':id/password-reset-invitations')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_PASSWORD_RESET_INVITATION_CREATE', 'USER_INVITATION')
  createPasswordResetInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.createPasswordResetInvitation(user.organizationId, user.id, id);
  }

  @Post(':id/revoke-sessions')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_SESSIONS_REVOKE', 'SESSION')
  revokeSessions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.revokeSessions(user.organizationId, id);
  }
}
