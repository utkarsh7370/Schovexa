import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createExamPaperSchema, createExamSchema, decideNoteSchema, markCorrectionSchema, rejectNoteSchema, saveMarksSchema } from '@schovexa/validation';
import type { CreateExamInput, CreateExamPaperInput, DecideNoteInput, MarkCorrectionInput, RejectNoteInput, SaveMarksInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthContext } from '../authorization/authorization.types';
import { requestMeta } from '../common/request-meta.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ExamsService } from './exams.service';
import { MarkCorrectionsService } from './mark-corrections.service';
import { MarksService } from './marks.service';
import { ResultsService } from './results.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

@Controller('exams')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly marks: MarksService,
    private readonly corrections: MarkCorrectionsService,
    private readonly authorization: AuthorizationService,
  ) {}

  // -- Exams and papers ------------------------------------------------------------------
  @Get()
  @RequirePermission('exam.view')
  list(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.list(auth, { from: text(from), to: text(to) });
  }

  @Post()
  @RequirePermission('exam.manage')
  create(@Body(new ZodValidationPipe(createExamSchema)) body: CreateExamInput, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.create(auth, body);
  }

  // -- Marks workflow (fixed paths before :id so they are never taken for an exam id) -----------
  @Get('papers/mine')
  @RequirePermission('marks.view')
  mine(@CurrentAuthContext() auth: AuthContext) {
    return this.marks.mine(auth);
  }

  @Get('papers/queue')
  @RequirePermission('marks.view')
  queue(@Query('status') status: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.marks.queue(auth, text(status));
  }

  @Get('corrections')
  @RequirePermission('marks.view')
  listCorrections(@Query('status') status: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.corrections.list(auth, text(status));
  }

  @Post('corrections/:id/approve')
  @RequirePermission('marks.approve')
  approveCorrection(@Param('id') id: string, @Body(new ZodValidationPipe(decideNoteSchema)) body: DecideNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.approve(auth, id, body.note || undefined, requestMeta(req));
  }

  @Post('corrections/:id/reject')
  @RequirePermission('marks.approve')
  rejectCorrection(@Param('id') id: string, @Body(new ZodValidationPipe(rejectNoteSchema)) body: RejectNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.reject(auth, id, body.note, requestMeta(req));
  }

  @Get('papers/:paperId')
  @RequirePermission('marks.view')
  paper(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.marks.detail(auth, paperId);
  }

  @Put('papers/:paperId/marks')
  @RequirePermission('marks.enter')
  save(@Param('paperId') paperId: string, @Body(new ZodValidationPipe(saveMarksSchema)) body: SaveMarksInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.marks.save(auth, paperId, body, requestMeta(req));
  }

  @Post('papers/:paperId/submit')
  @RequirePermission('marks.enter')
  submit(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.marks.submit(auth, paperId, requestMeta(req));
  }

  @Post('papers/:paperId/corrections')
  @RequirePermission('marks.enter')
  requestCorrection(@Param('paperId') paperId: string, @Body(new ZodValidationPipe(markCorrectionSchema)) body: MarkCorrectionInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.corrections.request(auth, paperId, body.reason, requestMeta(req));
  }

  @Post('papers/:paperId/review')
  @RequirePermission('marks.review')
  review(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.marks.review(auth, paperId, requestMeta(req));
  }

  @Post('papers/:paperId/return')
  @RequirePermission('marks.review')
  giveBack(@Param('paperId') paperId: string, @Body(new ZodValidationPipe(rejectNoteSchema)) body: RejectNoteInput, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.marks.giveBack(auth, paperId, body.note, requestMeta(req));
  }

  @Post('papers/:paperId/approve')
  @RequirePermission('marks.approve')
  async approve(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    const canReview = !!(await this.authorization.getGrant(auth.roleId, 'marks.review'));
    return this.marks.approve(auth, paperId, canReview, requestMeta(req));
  }

  @Post('papers/:paperId/publish')
  @RequirePermission('marks.approve')
  publish(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.marks.publish(auth, paperId, requestMeta(req));
  }

  @Patch('papers/:paperId')
  @RequirePermission('exam.manage')
  updatePaper(@Param('paperId') paperId: string, @Body(new ZodValidationPipe(createExamPaperSchema.partial())) body: Partial<CreateExamPaperInput>, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.updatePaper(auth, paperId, body);
  }

  @Delete('papers/:paperId')
  @RequirePermission('exam.manage')
  removePaper(@Param('paperId') paperId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.removePaper(auth, paperId);
  }

  @Post(':examId/papers')
  @RequirePermission('exam.manage')
  addPaper(@Param('examId') examId: string, @Body(new ZodValidationPipe(createExamPaperSchema)) body: CreateExamPaperInput, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.addPaper(auth, examId, body);
  }

  @Delete(':examId')
  @RequirePermission('exam.manage')
  remove(@Param('examId') examId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.exams.remove(auth, examId);
  }
}

@Controller('results')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('students/:studentId')
  @RequirePermission('result.view')
  forStudent(@Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.results.forStudent(auth, studentId);
  }
}
