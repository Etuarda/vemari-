import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditResult, Role, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { Role as ContractRole } from '@vemari/contracts';
import type { AccessTokenPayload, AuthenticatedUser } from '@vemari/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RegisterDto } from './auth.dto';

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

  async register(dto: RegisterDto, metadata: AuthRequestMetadata) {
    if (!this.config.get<boolean>('PUBLIC_REGISTRATION_ENABLED', true)) {
      throw new ForbiddenException('Novos cadastros estão temporariamente desabilitados.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { slug: this.config.getOrThrow<string>('VEMARI_ORGANIZATION_SLUG') },
    });
    if (!organization) throw new ForbiddenException('Organização não configurada.');

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: organization.id, email } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Já existe um cadastro com este e-mail.');

    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        name: dto.name.trim(),
        email,
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        role: Role.READ_ONLY,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });

    await this.audit.write({
      organizationId: organization.id,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_REGISTER',
      resourceType: 'USER',
      resourceId: user.id,
      result: AuditResult.SUCCESS,
      ...metadata,
    });

    return { success: true, user };
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

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuário desativado.');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Acesso temporariamente bloqueado por tentativas inválidas.');
    }

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
}
