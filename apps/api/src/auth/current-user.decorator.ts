import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth.types';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** The authenticated user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
