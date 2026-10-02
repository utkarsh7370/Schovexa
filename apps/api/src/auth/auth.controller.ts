import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  reauthSchema,
  resetPasswordSchema,
  selectSchoolSchema,
  verifyEmailSchema,
} from '@schovexa/validation';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { CurrentSession } from './decorators/current-session.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SESSION_COOKIE_CLEAR_OPTIONS, SESSION_COOKIE_NAME, sessionCookieOptions } from './auth.constants';
import { requestMeta } from '../common/request-meta.util';
import type { SessionContext } from './auth.service';

// Note: the Zod pipe is bound to the @Body() parameter specifically, not
// via a method-level @UsePipes(). @UsePipes applies to every parameter
// Nest routes through its pipe pipeline — which includes @CurrentSession()
// (a custom param decorator) but not @Req()/@Res(). A method-level pipe
// here would run selectSchoolSchema/etc. against the SessionContext
// object too and fail it for missing fields it was never meant to have —
// caught by the live end-to-end check during this phase's own testing.

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Rate limited per docs/authentication.md §4 — brute-force/credential-
  // stuffing protection. In-process store, acceptable for a single-
  // instance MVP deployment per docs/security-scalability-review.md
  // finding F3; must move to a Redis-backed store before scaling past
  // one API instance.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  // A flood guard only — the real protection against guessing is the
  // failed-attempt lockout inside AuthService.login (5 misses, 15 minutes).
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string; rememberMe?: boolean },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { rawToken, rememberMe } = await this.authService.login(body.email, body.password, requestMeta(req), !!body.rememberMe);
    res.cookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(rememberMe));
    return { status: 'ok' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await this.authService.logout(rawToken, requestMeta(req));
    }
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_CLEAR_OPTIONS);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentSession() session: SessionContext) {
    return this.authService.getCurrentUser(session.userId, session.activeMembershipId);
  }

  @Post('select-school')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async selectSchool(
    @Body(new ZodValidationPipe(selectSchoolSchema)) body: { membershipId: string },
    @CurrentSession() session: SessionContext,
  ) {
    await this.authService.selectSchool(session.userId, session.sessionId, body.membershipId);
    return { status: 'ok' };
  }

  // Needs a session but no selected school — changing your password has
  // nothing to do with which school you're looking at. Rate limited because
  // it verifies the current password (guessing it from a stolen session).
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @CurrentSession() session: SessionContext,
    @Req() req: Request,
  ) {
    await this.authService.changePassword(session.userId, session.sessionId, body.currentPassword, body.newPassword, requestMeta(req));
    return { status: 'ok' };
  }

  // -- Sensitive actions: prove it's still you ------------------------------

  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  async reauth(
    @Body(new ZodValidationPipe(reauthSchema)) body: { password: string },
    @CurrentSession() session: SessionContext,
    @Req() req: Request,
  ) {
    await this.authService.reauthenticate(session.userId, session.sessionId, body.password, requestMeta(req));
    return { status: 'ok' };
  }

  // -- Devices & sessions -----------------------------------------------------

  @Get('sessions')
  @UseGuards(AuthGuard)
  async sessions(@CurrentSession() session: SessionContext) {
    return this.authService.listSessions(session.userId, session.sessionId);
  }

  // Declared before ':id' so "revoke-others" is never taken for an id.
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async revokeOthers(@CurrentSession() session: SessionContext, @Req() req: Request) {
    return this.authService.revokeOtherSessions(session.userId, session.sessionId, requestMeta(req));
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async revokeSession(@Param('id') id: string, @CurrentSession() session: SessionContext, @Req() req: Request) {
    await this.authService.revokeSession(session.userId, session.sessionId, id, requestMeta(req));
  }

  // The person's own security history: sign-ins, failed attempts, password changes.
  @Get('activity')
  @UseGuards(AuthGuard)
  async activity(@CurrentSession() session: SessionContext) {
    return this.authService.activity(session.userId);
  }

  // -- Email verification -----------------------------------------------------

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string }) {
    await this.authService.verifyEmail(body.token);
    return { status: 'ok' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async resendVerification(@CurrentSession() session: SessionContext) {
    await this.authService.sendVerificationEmail(session.userId, { enforceCooldown: true });
    return { status: 'ok' };
  }

  // Always 200 with a generic body — no user enumeration, per
  // docs/authentication.md §6.
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string }) {
    await this.authService.requestPasswordReset(body.email);
    return { status: 'ok', message: 'If that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    await this.authService.resetPassword(body.token, body.password);
    return { status: 'ok' };
  }

  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: { token: string; password: string },
  ) {
    await this.authService.acceptInvite(body.token, body.password);
    return { status: 'ok' };
  }
}
