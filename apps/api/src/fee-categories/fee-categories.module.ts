import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FeeCategoriesController } from './fee-categories.controller';
import { FeeCategoriesService } from './fee-categories.service';

@Module({
  imports: [AuthModule],
  controllers: [FeeCategoriesController],
  providers: [FeeCategoriesService],
})
export class FeeCategoriesModule {}
