import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AbsenceAlertsService } from './absence-alerts.service';
import { AttendanceCorrectionsController } from './attendance-corrections.controller';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController, AttendanceCorrectionsController],
  providers: [AttendanceService, AbsenceAlertsService, AttendanceCorrectionsService],
})
export class AttendanceModule {}
