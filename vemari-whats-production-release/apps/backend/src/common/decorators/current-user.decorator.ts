import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@vemari/contracts';
import type { FastifyRequest } from 'fastify';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user: AuthenticatedUser }>();
    return request.user;
  },
);
