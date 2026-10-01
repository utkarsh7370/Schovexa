import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { MeController } from './me.controller';
import { StaffController } from './staff.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [MeController, StaffController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
