import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import type { SessionContext } from '../auth/auth.service';
import type { AuthContext } from '../authorization/authorization.types';
import { requestMeta } from '../common/request-meta.util';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Areas that write their own, more descriptive audit entries (or are pure
// bookkeeping a person didn't consciously do).
const SKIP_AREAS = new Set(['auth', 'notifications', 'contact']);

// A safety net under the explicit audit entries: every successful change a
// signed-in person makes through the API leaves a trail — who, what route,
// on which record, from where — whether or not that module remembered to log
// it. It records the route and status only, never the request body (which
// can hold passwords, tokens or personal details).
@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { session?: SessionContext; authContext?: AuthContext }>();
    const res = context.switchToHttp().getResponse<Response>();
    if (!WRITE_METHODS.has(req.method) || !req.session) return next.handle();

    const pattern: string = (req.route?.path as string | undefined) ?? req.path;
    const area = pattern.replace(/^\/api\/v\d+\//, '').split('/')[0] ?? '';
    if (SKIP_AREAS.has(area)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const params = req.params as Record<string, string | undefined>;
        void this.audit
          .record({
            schoolId: req.authContext?.schoolId ?? null,
            userId: req.session!.userId,
            action: 'api.write',
            module: area || 'api',
            resourceType: area || 'api',
            resourceId: params.id ?? params.membershipId ?? params.studentId ?? '-',
            metadata: { method: req.method, route: pattern.replace(/^\/api\/v\d+/, ''), status: res.statusCode },
            ...requestMeta(req),
          })
          .catch(() => undefined); // an audit hiccup must never fail the request that already succeeded
      }),
    );
  }
}
