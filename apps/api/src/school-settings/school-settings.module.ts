import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchoolSettingsController } from './school-settings.controller';
import { SchoolSettingsService } from './school-settings.service';

// Global: attendance, fees, documents, notifications and the calendar all
// read the same settings, and none of them should have to re-import it.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [SchoolSettingsController],
  providers: [SchoolSettingsService],
  exports: [SchoolSettingsService],
})
export class SchoolSettingsModule {}
