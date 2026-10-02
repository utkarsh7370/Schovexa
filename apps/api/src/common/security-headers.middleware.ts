import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// Response headers every API reply carries. The API only ever returns JSON
// or an attachment download, never a page, so the policy is the strictest
// there is: nothing may be framed, loaded or executed from it.
//
//   nosniff             — a download can't be reinterpreted as a script
//   frame-ancestors     — can't be framed (clickjacking)
//   no-store            — private data is never kept by a browser or proxy
//   HSTS (production)   — browsers stay on HTTPS
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  }
}
