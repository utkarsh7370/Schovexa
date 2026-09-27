import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';

@Module({
  imports: [AuthModule],
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService],
})
export class AcademicYearsModule {}
