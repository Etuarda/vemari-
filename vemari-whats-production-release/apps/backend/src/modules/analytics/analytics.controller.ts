import { Controller, Get } from '@nestjs/common';
import { CampaignStatus, ConsentStatus, ConversationStatus, MessageStatus } from '@prisma/client';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  @RequirePermissions(Permission.ANALYTICS_READ)
  async summary(@CurrentUser() user: AuthenticatedUser) {
    const organizationId = user.organizationId;
    const [contacts, optedIn, optedOut, activeCampaigns, waitingConversations, sent, delivered, read, failed] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.contact.count({ where: { organizationId, deletedAt: null, marketingStatus: ConsentStatus.OPTED_IN } }),
      this.prisma.contact.count({ where: { organizationId, deletedAt: null, marketingStatus: ConsentStatus.OPTED_OUT } }),
      this.prisma.campaign.count({ where: { organizationId, status: { in: [CampaignStatus.PROCESSING, CampaignStatus.SCHEDULED] } } }),
      this.prisma.conversation.count({ where: { organizationId, status: { in: [ConversationStatus.UNASSIGNED, ConversationStatus.WAITING] } } }),
      this.prisma.message.count({ where: { organizationId, status: MessageStatus.SENT } }),
      this.prisma.message.count({ where: { organizationId, status: MessageStatus.DELIVERED } }),
      this.prisma.message.count({ where: { organizationId, status: MessageStatus.READ } }),
      this.prisma.message.count({ where: { organizationId, status: MessageStatus.FAILED } }),
    ]);
    return { contacts, optedIn, optedOut, activeCampaigns, waitingConversations, messages: { sent, delivered, read, failed } };
  }
}
