import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsentStatus } from '@prisma/client';
import { Permission } from '@vemari/contracts';
import type { AuthenticatedUser } from '@vemari/contracts';
import type { FastifyRequest } from 'fastify';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CreateContactDto,
  CreateSuppressionDto,
  RegisterConsentDto,
} from './contacts.dto';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermissions(Permission.CONTACT_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('status') status?: ConsentStatus,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.contacts.list(user.organizationId, {
      search,
      status,
      take: take ? Number(take) : undefined,
      cursor,
    });
  }

  @Post()
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @AuditAction('CONTACT_CREATE', 'CONTACT')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.contacts.create(user.organizationId, user.id, dto);
  }

  @Post('import')
  @RequirePermissions(Permission.CONTACT_MANAGE)
  @AuditAction('CONTACT_IMPORT', 'CONTACT')
  async importCsv(@CurrentUser() user: AuthenticatedUser, @Req() request: FastifyRequest) {
    const file = await request.file({
      limits: { fileSize: this.config.get<number>('MAX_CSV_IMPORT_BYTES', 10_485_760), files: 1 },
    });
    if (!file) throw new Error('Arquivo CSV não enviado.');
    if (!['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype)) {
      throw new Error('Formato não permitido. Envie um arquivo CSV.');
    }
    return this.contacts.importCsv(user.organizationId, user.id, await file.toBuffer());
  }

  @Post(':id/consents')
  @RequirePermissions(Permission.CONSENT_MANAGE)
  @AuditAction('CONSENT_REGISTER', 'CONSENT')
  registerConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RegisterConsentDto,
    @Req() request: FastifyRequest,
  ) {
    return this.contacts.registerConsent(user.organizationId, id, user.id, dto, request.ip);
  }

  @Post(':id/suppressions')
  @RequirePermissions(Permission.CONSENT_MANAGE)
  @AuditAction('SUPPRESSION_CREATE', 'SUPPRESSION')
  suppress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateSuppressionDto,
  ) {
    return this.contacts.suppress(user.organizationId, id, user.id, dto);
  }

  @Get('suppressions/active')
  @RequirePermissions(Permission.SUPPRESSION_READ)
  suppressions(@CurrentUser() user: AuthenticatedUser) {
    return this.contacts.listSuppressions(user.organizationId);
  }

  @Post('suppressions/:id/lift')
  @RequirePermissions(Permission.SUPPRESSION_REMOVE)
  @AuditAction('SUPPRESSION_LIFT', 'SUPPRESSION')
  lift(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.contacts.liftSuppression(user.organizationId, id, user.id);
  }
}
