import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';

// The audit-log viewer lives in its own module so AuditModule (global,
// imported by almost everything) never has to import AuthModule — which
// itself writes audit entries.
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
})
export class AuditLogsModule {}
