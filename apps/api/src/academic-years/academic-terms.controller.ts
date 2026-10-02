import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createTermSchema, updateTermSchema } from '@schovexa/validation';
import type { CreateTermInput, UpdateTermInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicTermsService } from './academic-terms.service';
import type { AuthContext } from '../authorization/authorization.types';

// Terms belong to an academic year: whoever may update the year
// (Principal, Director) may add and change its terms.
@Controller('academic-years/:yearId/terms')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class AcademicTermsController {
  constructor(private readonly terms: AcademicTermsService) {}

  @Get()
  @RequirePermission('academicYear.view')
  async list(@Param('yearId') yearId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.terms.list(auth.schoolId, yearId);
  }

  @Post()
  @RequirePermission('academicYear.update')
  async create(
    @Param('yearId') yearId: string,
    @Body(new ZodValidationPipe(createTermSchema)) body: CreateTermInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.terms.create(auth.schoolId, yearId, body);
  }

  @Patch(':termId')
  @RequirePermission('academicYear.update')
  async update(
    @Param('yearId') yearId: string,
    @Param('termId') termId: string,
    @Body(new ZodValidationPipe(updateTermSchema)) body: UpdateTermInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.terms.update(auth.schoolId, yearId, termId, body);
  }

  @Delete(':termId')
  @RequirePermission('academicYear.update')
  async remove(@Param('yearId') yearId: string, @Param('termId') termId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.terms.remove(auth.schoolId, yearId, termId);
  }
}
