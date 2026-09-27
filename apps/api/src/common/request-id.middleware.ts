import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

// Per-request correlation ID (docs/logging.md §3) — generated before any
// handler runs, echoed back in a response header, and available to the
// exception filter and any logging this request triggers.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const requestId = `req_${randomUUID()}`;
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
