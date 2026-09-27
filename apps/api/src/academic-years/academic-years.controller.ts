import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { createAcademicYearSchema } from '@schovexa/validation';
import type { CreateAcademicYearInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AcademicYearsService } from './academic-years.service';
import type { AuthContext } from '../authorization/authorization.types';

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

  @Post()
  @RequirePermission('academicYear.create')
  async create(
    @Body(new ZodValidationPipe(createAcademicYearSchema)) body: CreateAcademicYearInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.academicYearsService.create(auth.schoolId, body);
  }

  @Post(':id/set-current')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('academicYear.update')
  async setCurrent(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'AcademicYear', id);
    return this.academicYearsService.setCurrent(auth.schoolId, id);
  }
}
