import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Lightweight CSRF mitigation for the cookie-session model in
// docs/authentication.md §2: SameSite=Lax reduces but does not eliminate
// cross-site request risk (e.g. top-level navigations, some legacy
// browsers), so state-changing requests additionally require an Origin
// header that matches the configured frontend allow-list — an
// attacker's cross-origin page cannot forge this header. Non-browser
// clients without an Origin header are only a concern once third-party
// API access is offered, which is not in scope yet — see
// docs/authorization.md §7.
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigins: string[];

  constructor() {
    this.allowedOrigins = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    const origin = req.headers.origin;
    if (!origin || !this.allowedOrigins.includes(origin)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Request origin is not allowed.',
      });
    }

    next();
  }
}
