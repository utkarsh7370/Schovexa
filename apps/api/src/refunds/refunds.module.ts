import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';

@Module({
  imports: [AuthModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
