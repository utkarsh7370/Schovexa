import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  selectSchoolSchema,
} from '@schovexa/validation';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { CurrentSession } from './decorators/current-session.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from './auth.constants';
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
  @Throttle({ default: { limit: 5, ttl: 15 * 60 * 1000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { rawToken } = await this.authService.login(body.email, body.password, requestMeta(req));
    res.cookie(SESSION_COOKIE_NAME, rawToken, SESSION_COOKIE_OPTIONS);
    return { status: 'ok' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken) {
      await this.authService.logout(rawToken, requestMeta(req));
    }
    res.clearCookie(SESSION_COOKIE_NAME);
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
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    await this.authService.resetPassword(body.token, body.password);
    return { status: 'ok' };
  }

  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: { token: string; password: string },
  ) {
    await this.authService.acceptInvite(body.token, body.password);
    return { status: 'ok' };
  }
}
