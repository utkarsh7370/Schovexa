import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ExamsController, ResultsController } from './exams.controllers';
import { ExamsService } from './exams.service';
import { MarkCorrectionsService } from './mark-corrections.service';
import { MarksService } from './marks.service';
import { ResultsService } from './results.service';

@Module({
  imports: [GradingModule],
  controllers: [ExamsController, ResultsController],
  providers: [ExamsService, MarksService, MarkCorrectionsService, ResultsService],
  exports: [MarksService],
})
export class ExamsModule {}
