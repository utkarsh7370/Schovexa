import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { AttachmentsService } from './attachments.service';
import { RecipientsService } from './recipients.service';
import { SchoolClockService } from './school-clock.service';
import { TeachingScopeService } from './teaching-scope.service';

// The few things every teaching feature leans on: who may touch what (scope), the school's own
// "today", and file attachments. Global so each feature module stays small.
@Global()
@Module({
  imports: [AuthModule, DocumentsModule],
  providers: [TeachingScopeService, SchoolClockService, AttachmentsService, RecipientsService],
  exports: [TeachingScopeService, SchoolClockService, AttachmentsService, RecipientsService, AuthModule],
})
export class TeachingCoreModule {}
