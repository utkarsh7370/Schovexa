import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentsModule } from '../students/students.module';
import { FeeNotifierService } from './fee-notifier.service';
import { FinanceController } from './finance.controller';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceService } from './finance.service';

// Shared finance building blocks (family notices) and the accountant's
// workspace: dashboard, limited student lookup, ledger, demand, reminders,
// reports and the finance activity log. Payments, refunds and concessions live
// in their own modules and import this one for the notifier.
@Module({
  imports: [AuthModule, StudentsModule],
  controllers: [FinanceController],
  providers: [FeeNotifierService, FinanceService, FinanceReportsService],
  exports: [FeeNotifierService],
})
export class FinanceModule {}
