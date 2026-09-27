import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [AuthModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
