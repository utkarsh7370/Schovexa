import { Module } from '@nestjs/common';
import { AssignmentsController, HomeworkController } from './coursework.controllers';
import { CourseworkService } from './coursework.service';

@Module({
  controllers: [HomeworkController, AssignmentsController],
  providers: [CourseworkService],
  exports: [CourseworkService],
})
export class CourseworkModule {}
