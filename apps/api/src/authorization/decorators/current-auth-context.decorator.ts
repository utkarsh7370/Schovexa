import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../authorization.types';

// Reads the AuthContext that SchoolContextGuard (+ PermissionGuard)
// attached to the request — never re-derives schoolId/scope from
// anything client-supplied. Bound to @Body()-style pipes never apply to
// this (custom decorator, no schema to validate against) — see the note
// in auth.controller.ts about @UsePipes vs param-scoped pipes.
export const CurrentAuthContext = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request & { authContext?: AuthContext }>();
    return request.authContext as AuthContext;
  },
);
