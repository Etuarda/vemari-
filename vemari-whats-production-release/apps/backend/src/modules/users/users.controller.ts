import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
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
    return this.users.create(user.organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_UPDATE', 'USER')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user.organizationId, id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(Permission.USER_MANAGE)
  @AuditAction('USER_PASSWORD_RESET', 'USER')
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.users.resetPassword(user.organizationId, id, dto);
  }
}
