import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

// @Global() matching StorageModule/AuditModule — every module that
// needs to send an email (today: AuthService for invites/resets) picks
// this up without each one importing EmailModule individually.
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
