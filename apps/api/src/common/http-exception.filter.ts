import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Sentry } from '../monitoring/sentry';
import { AuditService } from '../audit/audit.service';
import type { SessionContext } from '../auth/auth.service';
import type { AuthContext } from '../authorization/authorization.types';
import { requestMeta } from './request-meta.util';

// Single place every thrown error passes through before reaching the
// client — produces the error envelope from docs/api.md §3 and never
// leaks a stack trace, SQL fragment, or internal detail in the response
// body (docs/api.md §4, docs/architecture.md "never expose internal
// errors to users"). Full detail is logged server-side only.
const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly audit: AuditService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { requestId?: string }).requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const shaped =
        typeof body === 'object' && body !== null && 'code' in body
          ? (body as { code: string; message: string; details?: unknown })
          : {
              code: DEFAULT_CODE_BY_STATUS[status] ?? 'ERROR',
              message: typeof body === 'string' ? body : (exception.message ?? 'Request failed'),
            };

      if (status >= 500) {
        this.logger.error({ requestId, status, message: shaped.message, stack: (exception as Error).stack });
        Sentry.captureException(exception);
      }

      // Security activity: a signed-in person was refused. Worth a trail — a
      // pattern of these is what probing for access looks like.
      const authed = request as Request & { session?: SessionContext; authContext?: AuthContext };
      if (status === HttpStatus.FORBIDDEN && authed.session) {
        // Awaited so the entry exists by the time the client sees the 403.
        await this.audit
          .record({
            schoolId: authed.authContext?.schoolId ?? null,
            userId: authed.session.userId,
            action: 'access.denied',
            module: 'security',
            resourceType: 'Route',
            resourceId: `${request.method} ${request.path}`.slice(0, 200),
            metadata: { code: shaped.code, method: request.method },
            ...requestMeta(request),
          })
          .catch(() => undefined);
      }

      response.status(status).json({ error: shaped, requestId });
      return;
    }

    // Unhandled, unexpected error — logged with full detail server-side,
    // never surfaced to the client.
    this.logger.error({
      requestId,
      message: (exception as Error)?.message,
      stack: (exception as Error)?.stack,
    });
    Sentry.captureException(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      requestId,
    });
  }
}
