import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NoticesController } from './notices.controller';
import { NoticeSchedulerService } from './notice-scheduler.service';
import { NoticesService } from './notices.service';

@Module({
  imports: [AuthModule],
  controllers: [NoticesController],
  providers: [NoticesService, NoticeSchedulerService],
  exports: [NoticesService],
})
export class NoticesModule {}
