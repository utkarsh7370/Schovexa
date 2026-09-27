import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, SessionContext } from '../auth.service';
import { SESSION_COOKIE_NAME } from '../auth.constants';

// Steps 1-2 of the tenant-resolution pipeline (docs/architecture.md §3,
// docs/multi-tenancy.md §2): verifies the session cookie is valid and the
// user is ACTIVE. Does NOT check membership/permission/scope — that is
// SchoolContextGuard + the permission guard built in the next phase
// (docs/authorization.md), which is a deliberate boundary matching the
// brief's own Phase 3 (Authentication) vs. Phase 4 (Authorization) split.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { session?: SessionContext }>();
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];

    if (!rawToken) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
    }

    const session = await this.authService.validateSession(rawToken);
    if (!session) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Session is invalid or expired.' });
    }

    request.session = session;
    return true;
  }
}
