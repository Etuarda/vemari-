import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, TemplateFiltersDto } from './templates.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions(Permission.TEMPLATE_READ)
  list(@CurrentUser() user: AuthenticatedUser, @Query() filters: TemplateFiltersDto) {
    return this.templates.list(user.organizationId, filters);
  }

  @Get(':id')
  @RequirePermissions(Permission.TEMPLATE_READ)
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.templates.detail(user.organizationId, id);
  }

  @Post('official')
  @RequirePermissions(Permission.TEMPLATE_CREATE)
  @AuditAction('TEMPLATE_CREATE_OFFICIAL', 'WHATSAPP_TEMPLATE')
  createOfficial(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto) {
    return this.templates.createOfficial(user.organizationId, dto);
  }

  @Post('simulator')
  @RequirePermissions(Permission.TEMPLATE_CREATE)
  @AuditAction('TEMPLATE_CREATE_SIMULATOR', 'WHATSAPP_TEMPLATE')
  createSimulator(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto) {
    return this.templates.createSimulator(user.organizationId, dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.TEMPLATE_UPDATE)
  @AuditAction('TEMPLATE_UPDATE', 'WHATSAPP_TEMPLATE')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.TEMPLATE_DELETE)
  @AuditAction('TEMPLATE_DELETE', 'WHATSAPP_TEMPLATE')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.templates.remove(user.organizationId, id);
  }

  @Post('sync')
  @RequirePermissions(Permission.TEMPLATE_SYNC)
  @AuditAction('TEMPLATE_SYNC', 'WHATSAPP_TEMPLATE')
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.templates.sync(user.organizationId);
  }
}
