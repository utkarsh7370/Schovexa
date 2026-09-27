import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createSubjectSchema, updateSubjectSchema } from '@schovexa/validation';
import type { CreateSubjectInput, UpdateSubjectInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SubjectsService } from './subjects.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('subjects')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class SubjectsController {
  constructor(
    private readonly subjectsService: SubjectsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('subject.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.subjectsService.list(auth.schoolId);
  }

  @Post()
  @RequirePermission('subject.create')
  async create(
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubjectInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.subjectsService.create(auth.schoolId, body);
  }

  @Patch(':id')
  @RequirePermission('subject.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubjectInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Subject', id);
    return this.subjectsService.update(auth.schoolId, id, body);
  }
}
