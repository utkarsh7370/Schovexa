import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

// docs/authentication.md §4 calls for rate limiting "per IP AND per
// email" — the default ThrottlerGuard tracks by IP alone, which would
// let an attacker spread credential-stuffing attempts against ONE
// victim email across many IPs while staying under any single IP's
// limit. Keying by IP+email closes that gap without adding new
// infrastructure. Falls back to IP alone when no email is present
// (e.g. a malformed body a downstream pipe will reject anyway).
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${req.ip}:${email}`;
  }
}
