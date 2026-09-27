import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createClassSchema, updateClassSchema } from '@schovexa/validation';
import type { CreateClassInput, UpdateClassInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClassesService } from './classes.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('classes')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('class.view')
  async list(@Query('academicYearId') academicYearId: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.classesService.list(auth.schoolId, academicYearId);
  }

  @Post()
  @RequirePermission('class.create')
  async create(
    @Body(new ZodValidationPipe(createClassSchema)) body: CreateClassInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.classesService.create(auth.schoolId, body);
  }

  @Patch(':id')
  @RequirePermission('class.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) body: UpdateClassInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Class', id);
    return this.classesService.update(auth.schoolId, id, body);
  }
}
