import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AbsenceAlertsService } from './absence-alerts.service';

@Module({
  imports: [AuthModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AbsenceAlertsService],
})
export class AttendanceModule {}
