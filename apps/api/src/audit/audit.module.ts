import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global for the same reason as PrismaModule — every feature module
// writes audit entries; re-importing this everywhere would be pure
// boilerplate.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
