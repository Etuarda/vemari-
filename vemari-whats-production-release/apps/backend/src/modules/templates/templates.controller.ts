import { Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions(Permission.TEMPLATE_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.templates.list(user.organizationId);
  }

  @Post('sync')
  @RequirePermissions(Permission.TEMPLATE_SYNC)
  @AuditAction('TEMPLATE_SYNC', 'WHATSAPP_TEMPLATE')
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.templates.sync(user.organizationId);
  }
}
