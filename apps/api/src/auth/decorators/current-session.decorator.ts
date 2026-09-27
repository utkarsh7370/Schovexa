import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionContext } from '../auth.service';
import type { Request } from 'express';

// Reads the SessionContext that AuthGuard attached to the request —
// never re-derives it from anything client-supplied.
export const CurrentSession = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionContext => {
  const request = ctx.switchToHttp().getRequest<Request & { session?: SessionContext }>();
  return request.session as SessionContext;
});
