import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { metaClientProvider } from '../whatsapp/meta.provider';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, metaClientProvider],
  exports: [TemplatesService],
})
export class TemplatesModule {}
