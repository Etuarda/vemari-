import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateCampaignDto } from './campaigns.dto';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions(Permission.CAMPAIGN_READ)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.list(user.organizationId);
  }

  @Post()
  @RequirePermissions(Permission.CAMPAIGN_CREATE)
  @AuditAction('CAMPAIGN_CREATE', 'CAMPAIGN')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user.organizationId, user.id, dto);
  }

  @Get(':id/validation')
  @RequirePermissions(Permission.CAMPAIGN_READ)
  validate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.validate(user.organizationId, id);
  }

  @Post(':id/start')
  @RequirePermissions(Permission.CAMPAIGN_SEND)
  @AuditAction('CAMPAIGN_START', 'CAMPAIGN')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.campaigns.start(user.organizationId, id, idempotencyKey);
  }

  @Post(':id/pause')
  @RequirePermissions(Permission.CAMPAIGN_SEND)
  @AuditAction('CAMPAIGN_PAUSE', 'CAMPAIGN')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.pause(user.organizationId, id);
  }

  @Post(':id/resume')
  @RequirePermissions(Permission.CAMPAIGN_SEND)
  @AuditAction('CAMPAIGN_RESUME', 'CAMPAIGN')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.resume(user.organizationId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.CAMPAIGN_SEND)
  @AuditAction('CAMPAIGN_CANCEL', 'CAMPAIGN')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.cancel(user.organizationId, id);
  }
}
