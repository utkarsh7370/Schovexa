import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createStudentSchema, linkParentSchema, updateStudentSchema } from '@schovexa/validation';
import type { CreateStudentInput, LinkParentInput, UpdateStudentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StudentsService } from './students.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('students')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('student.view')
  async list(
    @Query('sectionId') sectionId: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.studentsService.list(auth, { sectionId, status });
  }

  @Post()
  @RequirePermission('student.create')
  async create(
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.studentsService.create(auth.schoolId, body);
  }

  @Get(':id')
  @RequirePermission('student.view')
  async findOne(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.findOne(auth.schoolId, id);
  }

  @Patch(':id')
  @RequirePermission('student.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) body: UpdateStudentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.update(auth.schoolId, id, body);
  }

  @Delete(':id')
  @RequirePermission('student.delete')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.remove(auth.schoolId, id);
  }

  @Post(':id/parents')
  @RequirePermission('student.update')
  async linkParent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkParentSchema)) body: LinkParentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.linkParent(auth.schoolId, id, body);
  }

  @Delete(':id/parents/:parentId')
  @RequirePermission('student.update')
  async unlinkParent(
    @Param('id') id: string,
    @Param('parentId') parentId: string,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Student', id);
    return this.studentsService.unlinkParent(auth.schoolId, id, parentId);
  }
}
