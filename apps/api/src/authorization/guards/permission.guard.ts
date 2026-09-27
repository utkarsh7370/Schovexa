import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthorizationService } from '../authorization.service';
import { PERMISSION_METADATA_KEY } from '../decorators/require-permission.decorator';
import type { AuthContext } from '../authorization.types';

// Steps 4-5 of the pipeline (docs/architecture.md §3): does this role
// grant the permission @RequirePermission names, and — if the grant is
// readOnly — is the action itself non-mutating? Resolves and attaches
// scope/readOnly/action onto AuthContext for the handler to use in its
// own authorizeResource() call (step 6, resource-specific — this guard
// deliberately does not attempt that, since only the handler knows which
// resourceId is in play). Must run after SchoolContextGuard.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionKey = this.reflector.get<string | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    if (!permissionKey) {
      // No @RequirePermission on this route — nothing for this guard to
      // check. A route intentionally open to any authenticated+school-
      // scoped user (rare) simply doesn't use this guard at all.
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { authContext?: AuthContext }>();
    const auth = request.authContext;
    if (!auth) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'No school context available.' });
    }

    const grant = await this.authorizationService.getGrant(auth.roleId, permissionKey);
    if (!grant) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have this permission.' });
    }

    if (this.authorizationService.isMutationBlockedByReadOnly(grant)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You have read-only access for this permission.',
      });
    }

    auth.scope = grant.scope;
    auth.readOnly = grant.readOnly;
    auth.permissionAction = grant.action;

    return true;
  }
}
