import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { AcademicTermsController } from './academic-terms.controller';
import { AcademicTermsService } from './academic-terms.service';

@Module({
  imports: [AuthModule],
  controllers: [AcademicYearsController, AcademicTermsController],
  providers: [AcademicYearsService, AcademicTermsService],
})
export class AcademicYearsModule {}
