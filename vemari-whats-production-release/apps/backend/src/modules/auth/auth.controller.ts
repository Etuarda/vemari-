import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '@vemari/contracts';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ActivateAccountDto, InvitationTokenDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'vemari_refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(body.email, body.password, this.metadata(request));
    this.setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('invitations/validate')
  validateInvitation(@Query() query: InvitationTokenDto) {
    return this.auth.validateInvitation(query.token, 'ACCOUNT_ACTIVATION');
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  activate(@Body() body: ActivateAccountDto, @Req() request: FastifyRequest) {
    return this.auth.useInvitation(
      body.token,
      body.password,
      body.passwordConfirmation,
      'ACCOUNT_ACTIVATION',
      this.metadata(request),
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('password-reset-invitations/validate')
  validatePasswordReset(@Query() query: InvitationTokenDto) {
    return this.auth.validateInvitation(query.token, 'PASSWORD_RESET');
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() body: ActivateAccountDto, @Req() request: FastifyRequest) {
    return this.auth.useInvitation(
      body.token,
      body.password,
      body.passwordConfirmation,
      'PASSWORD_RESET',
      this.metadata(request),
    );
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.auth.refresh(request.cookies[REFRESH_COOKIE], this.metadata(request));
    this.setRefreshCookie(reply, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(request.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private setRefreshCookie(reply: FastifyReply, value: string, expires: Date) {
    reply.setCookie(REFRESH_COOKIE, value, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires,
    });
  }

  private metadata(request: FastifyRequest) {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: request.id,
      correlationId: String(request.headers['x-correlation-id'] ?? request.id),
    };
  }
}
