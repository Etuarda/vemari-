import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationType, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACTIVATION_INVITATION_TTL_MS,
  createInvitationToken,
  PASSWORD_RESET_INVITATION_TTL_MS,
} from '../../shared/invitations';
import { CreateUserDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, status: { not: UserStatus.REMOVED } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
        invitations: {
          where: { type: InvitationType.ACCOUNT_ACTIVATION },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { expiresAt: true, usedAt: true, revokedAt: true, createdAt: true },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async create(organizationId: string, createdById: string, dto: CreateUserDto) {
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = new Date(Date.now() + ACTIVATION_INVITATION_TTL_MS);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            organizationId,
            email: dto.email.trim().toLowerCase(),
            name: dto.name.trim(),
            role: dto.role,
            passwordHash: null,
            status: UserStatus.INVITED,
          },
          select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
        });
        await tx.userInvitation.create({
          data: {
            organizationId,
            userId: created.id,
            createdById,
            type: InvitationType.ACCOUNT_ACTIVATION,
            tokenHash,
            expiresAt,
          },
        });
        return created;
      });
      return {
        user,
        invitation: { activationUrl: this.url('/ativar-conta', token), expiresAt },
      };
    } catch (error: any) {
      if (error?.code === 'P2002')
        throw new ConflictException('Já existe um usuário com este e-mail.');
      throw error;
    }
  }

  async update(organizationId: string, actorId: string, id: string, dto: UpdateUserDto) {
    const current = await this.findOrThrow(organizationId, id);
    if (
      current.role === Role.ADMIN &&
      ((dto.role && dto.role !== Role.ADMIN) || (dto.status && dto.status !== UserStatus.ACTIVE))
    ) {
      await this.ensureAnotherActiveAdmin(organizationId, id);
    }
    if (actorId === id && dto.status && dto.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Você não pode suspender ou remover seu próprio acesso.');
    }

    const roleChanged = dto.role !== undefined && dto.role !== current.role;
    return this.prisma.$transaction(async (tx) => {
      if (roleChanged || dto.status === UserStatus.SUSPENDED || dto.status === UserStatus.REMOVED) {
        await tx.userInvitation.updateMany({
          where: { userId: id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      if (dto.status === UserStatus.SUSPENDED || dto.status === UserStatus.REMOVED) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.user.update({
        where: { id },
        data: dto,
        select: { id: true, email: true, name: true, role: true, status: true, updatedAt: true },
      });
    });
  }

  async createActivationInvitation(organizationId: string, createdById: string, userId: string) {
    const user = await this.findOrThrow(organizationId, userId);
    if (user.status !== UserStatus.INVITED) {
      throw new ConflictException(
        'Somente usuários ainda não ativados podem receber um novo convite de ativação.',
      );
    }
    return this.issueInvitation(
      organizationId,
      createdById,
      userId,
      InvitationType.ACCOUNT_ACTIVATION,
    );
  }

  async createPasswordResetInvitation(organizationId: string, createdById: string, userId: string) {
    const user = await this.findOrThrow(organizationId, userId);
    if (user.status !== UserStatus.ACTIVE)
      throw new ConflictException('Somente usuários ativos podem redefinir a senha.');
    return this.issueInvitation(organizationId, createdById, userId, InvitationType.PASSWORD_RESET);
  }

  async revokeInvitations(organizationId: string, userId: string) {
    await this.findOrThrow(organizationId, userId);
    const result = await this.prisma.userInvitation.updateMany({
      where: { organizationId, userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, revoked: result.count };
  }

  async revokeSessions(organizationId: string, userId: string) {
    await this.findOrThrow(organizationId, userId);
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, revoked: result.count };
  }

  attendants(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
        organizationId,
        status: UserStatus.ACTIVE,
        role: { in: [Role.ATTENDANT, Role.SUPERVISOR, Role.ADMIN] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  private async issueInvitation(
    organizationId: string,
    createdById: string,
    userId: string,
    type: InvitationType,
  ) {
    const { token, tokenHash } = createInvitationToken();
    const ttl =
      type === InvitationType.ACCOUNT_ACTIVATION
        ? ACTIVATION_INVITATION_TTL_MS
        : PASSWORD_RESET_INVITATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    await this.prisma.$transaction([
      this.prisma.userInvitation.updateMany({
        where: { userId, type, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.userInvitation.create({
        data: { organizationId, userId, createdById, type, tokenHash, expiresAt },
      }),
    ]);
    const path = type === InvitationType.ACCOUNT_ACTIVATION ? '/ativar-conta' : '/redefinir-senha';
    const key = type === InvitationType.ACCOUNT_ACTIVATION ? 'activationUrl' : 'resetUrl';
    return { [key]: this.url(path, token), expiresAt };
  }

  private url(path: string, token: string) {
    const base = this.config.getOrThrow<string>('WEB_URL').replace(/\/$/, '');
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  private async findOrThrow(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  private async ensureAnotherActiveAdmin(organizationId: string, userId: string) {
    const count = await this.prisma.user.count({
      where: { organizationId, id: { not: userId }, role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    if (!count)
      throw new ForbiddenException(
        'Não é possível remover ou suspender o último administrador ativo.',
      );
  }
}
