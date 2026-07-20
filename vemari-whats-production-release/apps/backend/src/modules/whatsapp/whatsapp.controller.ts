import { Body, Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@vemari/contracts';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { TestMessageDto } from './whatsapp.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  @Get('status')
  @RequirePermissions(Permission.META_INTEGRATION_READ)
  status() {
    return this.whatsapp.status();
  }

  @Post('test-message')
  @RequirePermissions(Permission.META_INTEGRATION_MANAGE)
  @AuditAction('META_TEST_MESSAGE', 'WHATSAPP_INTEGRATION')
  test(@Body() dto: TestMessageDto) {
    return this.whatsapp.testMessage(dto.to, dto.templateName, dto.languageCode);
  }
}
