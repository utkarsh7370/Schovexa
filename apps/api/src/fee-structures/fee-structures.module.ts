import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeeStructuresController } from './fee-structures.controller';
import { FeeStructuresService } from './fee-structures.service';

@Module({
  imports: [AuthModule],
  controllers: [FeeStructuresController],
  providers: [FeeStructuresService],
})
export class FeeStructuresModule {}
