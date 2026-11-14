import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessClaims } from './token.service.js';

export const IS_PUBLIC = 'auth:isPublic';
/** Opts a route out of the global sign-in requirement. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The signed-in user's claims, set by AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessClaims => {
  return ctx.switchToHttp().getRequest<{ user: AccessClaims }>().user;
});
