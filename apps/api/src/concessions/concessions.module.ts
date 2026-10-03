import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConcessionsController } from './concessions.controller';
import { ConcessionsService } from './concessions.service';

@Module({
  imports: [AuthModule],
  controllers: [ConcessionsController],
  providers: [ConcessionsService],
})
export class ConcessionsModule {}
