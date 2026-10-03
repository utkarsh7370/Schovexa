import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { GradingModule } from '../grading/grading.module';
import { LeaveModule } from '../leave/leave.module';
import { NoticesModule } from '../notices/notices.module';
import { TimetableModule } from '../timetable/timetable.module';
import { TeachingController } from './teaching.controller';
import { TeachingDashboardService } from './teaching-dashboard.service';
import { TeachingReportsService } from './teaching-reports.service';

@Module({
  imports: [TimetableModule, LeaveModule, NoticesModule, GradingModule, EventsModule],
  controllers: [TeachingController],
  providers: [TeachingDashboardService, TeachingReportsService],
})
export class TeachingModule {}
