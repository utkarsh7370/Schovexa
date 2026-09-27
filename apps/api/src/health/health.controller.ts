import { Controller, Get } from '@nestjs/common';

// Unauthenticated by design — used by load balancers / uptime checks
// (docs/architecture.md §13). Must never return anything beyond liveness;
// no schema, dependency, or config detail.
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
