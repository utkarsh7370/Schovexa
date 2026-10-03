import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [AuthModule, FinanceModule],
  controllers: [PaymentsController, ReceiptsController],
  providers: [PaymentsService, ReceiptsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
