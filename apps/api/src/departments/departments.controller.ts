import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createDepartmentSchema, updateDepartmentSchema } from '@schovexa/validation';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DepartmentsService } from './departments.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('departments')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission('department.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.departments.list(auth.schoolId);
  }

  @Get(':id')
  @RequirePermission('department.view')
  async detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.departments.detail(auth.schoolId, id);
  }

  @Post()
  @RequirePermission('department.create')
  async create(@Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput, @CurrentAuthContext() auth: AuthContext) {
    return this.departments.create(auth.schoolId, body);
  }

  @Patch(':id')
  @RequirePermission('department.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartmentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.departments.update(auth.schoolId, id, body);
  }

  @Delete(':id')
  @RequirePermission('department.update')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.departments.remove(auth.schoolId, id);
  }
}
