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

  catch(exception: unknown, host: ArgumentsHost) {
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
