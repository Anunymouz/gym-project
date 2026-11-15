import type { Role } from '@bgym/shared';
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessClaims } from './token.service.js';

export const IS_PUBLIC = 'auth:isPublic';
/** Opts a route out of the global sign-in requirement. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_ROLES = 'auth:roles';
/**
 * Requires one of these platform roles. Checked against the database on every request (not
 * the token), so removing someone's role takes effect immediately.
 */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

/** The signed-in user's claims, set by AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessClaims => {
  return ctx.switchToHttp().getRequest<{ user: AccessClaims }>().user;
});
