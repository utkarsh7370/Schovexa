import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTeacherAssignmentSchema,
  createTeacherSchema,
  updateTeacherSchema,
} from '@schovexa/validation';
import type {
  CreateTeacherAssignmentInput,
  CreateTeacherInput,
  UpdateTeacherInput,
} from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TeachersService } from './teachers.service';
import { ProfileService } from '../profile/profile.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('teachers')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class TeachersController {
  constructor(
    private readonly teachersService: TeachersService,
    private readonly authorizationService: AuthorizationService,
    private readonly profileService: ProfileService,
  ) {}

  @Get()
  @RequirePermission('teacher.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.teachersService.list(auth.schoolId);
  }

  // The teacher's full profile — contact details, class-teacher sections,
  // subject assignments. Declared before ':id/assignments' only for
  // readability; Nest matches the two distinct paths either way.
  @Get(':id')
  @RequirePermission('teacher.view')
  async detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Teacher', id);
    return this.profileService.getByTeacherId(auth.schoolId, id);
  }

  @Post()
  @RequirePermission('teacher.create')
  async create(
    @Body(new ZodValidationPipe(createTeacherSchema)) body: CreateTeacherInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.teachersService.create(auth.schoolId, body);
  }

  @Patch(':id')
  @RequirePermission('teacher.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTeacherSchema)) body: UpdateTeacherInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Teacher', id);
    return this.teachersService.update(auth.schoolId, id, body);
  }

  @Get(':id/assignments')
  @RequirePermission('teacher.view')
  async listAssignments(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Teacher', id);
    return this.teachersService.listAssignments(auth.schoolId, id);
  }

  @Post(':id/assignments')
  @RequirePermission('teacher.update')
  async createAssignment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTeacherAssignmentSchema)) body: CreateTeacherAssignmentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Teacher', id);
    return this.teachersService.createAssignment(auth.schoolId, id, body);
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermission('teacher.update')
  async removeAssignment(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Teacher', id);
    return this.teachersService.removeAssignment(auth.schoolId, id, assignmentId);
  }
}
