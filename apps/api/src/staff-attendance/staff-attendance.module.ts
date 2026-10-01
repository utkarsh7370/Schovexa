import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffAttendanceController } from './staff-attendance.controller';
import { StaffAttendanceService } from './staff-attendance.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffAttendanceController],
  providers: [StaffAttendanceService],
})
export class StaffAttendanceModule {}
