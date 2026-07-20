import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId,
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          role: dto.role,
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          status: UserStatus.ACTIVE,
        },
        select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
      });
      return user;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Já existe um usuário com este e-mail.');
      throw error;
    }
  }

  async update(organizationId: string, id: string, dto: UpdateUserDto) {
    await this.ensureExists(organizationId, id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, name: true, role: true, status: true, updatedAt: true },
    });
  }

  async resetPassword(organizationId: string, id: string, dto: ResetPasswordDto) {
    await this.ensureExists(organizationId, id);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
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

  private async ensureExists(organizationId: string, id: string) {
    const count = await this.prisma.user.count({ where: { id, organizationId } });
    if (!count) throw new NotFoundException('Usuário não encontrado.');
  }
}
