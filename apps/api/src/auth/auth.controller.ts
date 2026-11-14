import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  refreshRequestSchema,
  updateProfileSchema,
  requestEmailCodeSchema,
  verifyEmailCodeSchema,
  type AuthSession,
  type AuthTokens,
  type AuthUser,
  type RefreshRequest,
  type RequestEmailCodeInput,
  type RequestEmailCodeResponse,
  type UpdateProfileInput,
  type VerifyEmailCodeInput,
} from '@bgym/shared';
import { AuthService } from './auth.service.js';
import { Client } from './client-meta.js';
import { CurrentUser, Public } from './decorators.js';
import { TokenService, type AccessClaims } from './token.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  /** Emails a 6-digit sign-in code. Same response whether or not the account exists. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post('email/request')
  @HttpCode(HttpStatus.ACCEPTED)
  request(@Body({ schema: requestEmailCodeSchema }) body: RequestEmailCodeInput, @Client() client: { ip: string }): Promise<RequestEmailCodeResponse> {
    return this.auth.requestEmailCode(body.email, client.ip);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body({ schema: verifyEmailCodeSchema }) body: VerifyEmailCodeInput, @Client() client: { ip: string; userAgent?: string }): Promise<AuthSession> {
    return this.auth.verifyEmailCode(body.email, body.code, client);
  }

  /** Exchanges a refresh token for a new pair (the old refresh token stops working). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body({ schema: refreshRequestSchema }) body: RefreshRequest, @Client() client: { ip: string; userAgent?: string }): Promise<AuthTokens> {
    return this.tokens.rotate(body.refreshToken, { userAgent: client.userAgent, ipHash: this.auth.hashIp(client.ip) });
  }

  @Public()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Body({ schema: refreshRequestSchema }) body: RefreshRequest): Promise<void> {
    await this.tokens.revoke(body.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AccessClaims): Promise<AuthUser> {
    return this.auth.getUser(user.userId);
  }

  /** Profile step after sign-up, and later edits from the Me tab. */
  @Patch('me')
  updateMe(@CurrentUser() user: AccessClaims, @Body({ schema: updateProfileSchema }) body: UpdateProfileInput): Promise<AuthUser> {
    return this.auth.updateProfile(user.userId, body);
  }
}
