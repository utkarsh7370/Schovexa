import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DepartmentsModule } from '../departments/departments.module';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [AuthModule, ProfileModule, DepartmentsModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
