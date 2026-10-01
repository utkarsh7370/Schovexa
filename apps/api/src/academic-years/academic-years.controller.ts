import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  approveAcademicYearSchema,
  createAcademicYearSchema,
  resubmitAcademicYearSchema,
  reviewAcademicYearSchema,
  updateAcademicYearSchema,
} from '@schovexa/validation';
import type {
  ApproveAcademicYearInput,
  CreateAcademicYearInput,
  ResubmitAcademicYearInput,
  ReviewAcademicYearInput,
  UpdateAcademicYearInput,
} from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicYearsService } from './academic-years.service';
import type { AuthContext } from '../authorization/authorization.types';

// Who does what with an academic year:
//   create / update / resubmit — academicYear.create / .update (Principal, Director)
//   approve / reject / request-changes — academicYear.approve (Director)
// A year proposed by someone who can't approve it waits as PENDING_APPROVAL.
@Controller('academic-years')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class AcademicYearsController {
  constructor(
    private readonly academicYearsService: AcademicYearsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('academicYear.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.academicYearsService.list(auth.schoolId);
  }

  // Declared before ':id' routes so "attention" is never read as an id.
  @Get('attention')
  @RequirePermission('academicYear.view')
  async attention(@CurrentAuthContext() auth: AuthContext) {
    return this.academicYearsService.attention(auth);
  }

  @Post()
  @RequirePermission('academicYear.create')
  async create(
    @Body(new ZodValidationPipe(createAcademicYearSchema)) body: CreateAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.academicYearsService.create(auth, body);
  }

  @Get(':id/reviews')
  @RequirePermission('academicYear.view')
  async reviews(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.reviews(auth.schoolId, id);
  }

  @Patch(':id')
  @RequirePermission('academicYear.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAcademicYearSchema)) body: UpdateAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.update(auth, id, body);
  }

  @Post(':id/resubmit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.create')
  async resubmit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resubmitAcademicYearSchema)) body: ResubmitAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.resubmit(auth, id, body.note);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.approve')
  async approve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(approveAcademicYearSchema)) body: ApproveAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.approve(auth, id, body.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.approve')
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewAcademicYearSchema)) body: ReviewAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.reject(auth, id, body.note);
  }

  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.approve')
  async requestChanges(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewAcademicYearSchema)) body: ReviewAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.requestChanges(auth, id, body.note);
  }

  @Post(':id/set-current')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.update')
  async setCurrent(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.setCurrent(auth.schoolId, id);
  }
}
