import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentFeesController } from './student-fees.controller';
import { StudentFeesService } from './student-fees.service';

@Module({
  imports: [AuthModule],
  controllers: [StudentFeesController],
  providers: [StudentFeesService],
})
export class StudentFeesModule {}
