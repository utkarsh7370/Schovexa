import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { StudentFeesController } from './student-fees.controller';
import { StudentFeesService } from './student-fees.service';

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [StudentFeesController],
  providers: [StudentFeesService],
})
export class StudentFeesModule {}
