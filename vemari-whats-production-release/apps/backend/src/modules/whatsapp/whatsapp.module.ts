import { Module } from '@nestjs/common';
import { META_CLIENT, metaClientProvider } from './meta.provider';
import { WebhookController } from './webhook.controller';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  controllers: [WhatsAppController, WebhookController],
  providers: [metaClientProvider, WhatsAppService],
  exports: [META_CLIENT],
})
export class WhatsAppModule {}
