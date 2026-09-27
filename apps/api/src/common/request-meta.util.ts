import type { Request } from 'express';

// Shared by every controller that needs to pass IP/user-agent into
// AuditService.record() or AuthService methods — one definition, not one
// per controller.
export function requestMeta(req: Request) {
  return { ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}
