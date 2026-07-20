import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaWhatsAppClient } from '@vemari/meta';
import { META_CLIENT } from './meta.provider';

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(META_CLIENT) private readonly meta: MetaWhatsAppClient,
    private readonly config: ConfigService,
  ) {}

  async status() {
    if (!this.meta.isConfigured()) {
      return {
        configured: false,
        connected: false,
        reason: 'Preencha as variáveis META_* no secret manager do ambiente.',
        graphApiVersion: this.config.get<string>('META_GRAPH_API_VERSION'),
      };
    }
    const phone = await this.meta.getPhoneStatus();
    return {
      configured: true,
      connected: true,
      graphApiVersion: this.config.get<string>('META_GRAPH_API_VERSION'),
      useMarketingMessagesApi: this.config.get<boolean>('META_USE_MARKETING_MESSAGES_API'),
      phone,
    };
  }

  testMessage(to: string, templateName = 'hello_world', languageCode = 'en_US') {
    return this.meta.sendTemplate({
      to: to.startsWith('+') ? to.slice(1) : to,
      templateName,
      languageCode,
      forceCloudApi: true,
    });
  }
}
