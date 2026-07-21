import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditResult, InvitationType, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { Role as ContractRole } from '@vemari/contracts';
import type { AccessTokenPayload, AuthenticatedUser } from '@vemari/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashInvitationToken } from '../../shared/invitations';

export type AuthRequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async validateInvitation(token: string, type: keyof typeof InvitationType) {
    const invitation = await this.findValidInvitation(token, InvitationType[type]);
    if (!invitation) return { valid: false };
    return {
      valid: true,
      user: {
        name: invitation.user.name,
        email: invitation.user.email,
        role: invitation.user.role,
      },
      expiresAt: invitation.expiresAt,
    };
  }

  async useInvitation(
    token: string,
    password: string,
    passwordConfirmation: string,
    typeKey: keyof typeof InvitationType,
    metadata: AuthRequestMetadata,
  ) {
    if (password !== passwordConfirmation)
      throw new BadRequestException('As senhas não coincidem.');
    const type = InvitationType[typeKey];
    const invitation = await this.findValidInvitation(token, type);
    if (!invitation)
      throw new BadRequestException('O link é inválido, expirou ou já foi utilizado.');

    const now = new Date();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.userInvitation.updateMany({
        where: {
          id: invitation.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('O link não está mais disponível.');
      await tx.userInvitation.updateMany({
        where: {
          userId: invitation.userId,
          id: { not: invitation.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      await tx.session.updateMany({
        where: { userId: invitation.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    });

    await this.audit.write({
      organizationId: invitation.organizationId,
      actorUserId: invitation.userId,
      actorEmail: invitation.user.email,
      actorRole: invitation.user.role,
      action:
        type === InvitationType.ACCOUNT_ACTIVATION
          ? 'AUTH_ACCOUNT_ACTIVATE'
          : 'AUTH_PASSWORD_RESET',
      resourceType: 'USER',
      resourceId: invitation.userId,
      result: AuditResult.SUCCESS,
      ...metadata,
    });
    return { success: true };
  }

  async login(email: string, password: string, metadata: AuthRequestMetadata) {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: this.config.getOrThrow<string>('VEMARI_ORGANIZATION_SLUG') },
    });
    if (!organization) throw new UnauthorizedException('Credenciais inválidas.');

    const user = await this.prisma.user.findUnique({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: email.trim().toLowerCase(),
        },
      },
    });

    if (!user) {
      await this.audit.write({
        organizationId: organization.id,
        actorEmail: email.trim().toLowerCase(),
        action: 'AUTH_LOGIN',
        resourceType: 'SESSION',
        result: AuditResult.FAILURE,
        reason: 'Usuário não encontrado',
        ...metadata,
      });
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.status === UserStatus.INVITED)
      throw new ForbiddenException('A conta ainda não foi ativada.');
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('O acesso está suspenso ou removido.');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Acesso temporariamente bloqueado por tentativas inválidas.');
    }

    if (!user.passwordHash) throw new ForbiddenException('A conta ainda não foi ativada.');
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= maxAttempts;
      const lockedUntil = shouldLock
        ? new Date(Date.now() + this.config.get<number>('LOGIN_LOCK_MINUTES', 15) * 60_000)
        : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil,
        },
      });
      await this.audit.write({
        organizationId: organization.id,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH_LOGIN',
        resourceType: 'SESSION',
        result: AuditResult.FAILURE,
        reason: shouldLock ? 'Senha inválida; usuário bloqueado' : 'Senha inválida',
        ...metadata,
      });
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueSession(
      {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        name: user.name,
        role: ContractRole[String(user.role) as keyof typeof ContractRole],
      },
      metadata,
    );

    await this.audit.write({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_LOGIN',
      resourceType: 'SESSION',
      result: AuditResult.SUCCESS,
      ...metadata,
    });

    return tokens;
  }

  async refresh(refreshCookie: string | undefined, metadata: AuthRequestMetadata) {
    if (!refreshCookie) throw new UnauthorizedException('Sessão ausente.');
    const [sessionId, secret] = refreshCookie.split('.');
    if (!sessionId || !secret) throw new UnauthorizedException('Sessão inválida.');

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Sessão expirada ou revogada.');
    }
    if (this.hashRefreshSecret(secret) !== session.refreshTokenHash) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão inválida.');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(
      {
        id: session.user.id,
        organizationId: session.user.organizationId,
        email: session.user.email,
        name: session.user.name,
        role: ContractRole[String(session.user.role) as keyof typeof ContractRole],
      },
      metadata,
    );
  }

  async logout(refreshCookie: string | undefined): Promise<void> {
    const sessionId = refreshCookie?.split('.')[0];
    if (!sessionId) return;
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: AuthenticatedUser, metadata: AuthRequestMetadata) {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
      type: 'access',
    };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900),
    });

    const secret = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 7) * 86_400_000,
    );
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashRefreshSecret(secret),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: `${session.id}.${secret}`,
      refreshExpiresAt: expiresAt,
      user,
    };
  }

  private hashRefreshSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private findValidInvitation(token: string, type: InvitationType) {
    const tokenHash = hashInvitationToken(token);
    return this.prisma.userInvitation.findFirst({
      where: {
        tokenHash,
        type,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          status:
            type === InvitationType.ACCOUNT_ACTIVATION ? UserStatus.INVITED : UserStatus.ACTIVE,
        },
      },
      include: { user: true },
    });
  }
}
