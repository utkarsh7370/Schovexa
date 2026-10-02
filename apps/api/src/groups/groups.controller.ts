import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { addGroupMembersSchema, createGroupSchema, updateGroupSchema } from '@schovexa/validation';
import type { AddGroupMembersInput, CreateGroupInput, UpdateGroupInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GroupsService } from './groups.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('groups')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('group.view')
  async list(@Query('kind') kind: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.list(auth.schoolId, kind);
  }

  // The houses and groups of one student — gated like the student record
  // itself, so a teacher or parent sees only students they may see.
  @Get('student/:studentId')
  @RequirePermission('student.view')
  async forStudent(@Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Student', studentId);
    return this.groups.forStudent(auth.schoolId, studentId);
  }

  @Get(':id')
  @RequirePermission('group.view')
  async detail(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.detail(auth.schoolId, id);
  }

  @Post()
  @RequirePermission('group.create')
  async create(@Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.create(auth.schoolId, body);
  }

  @Patch(':id')
  @RequirePermission('group.update')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(updateGroupSchema)) body: UpdateGroupInput, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.update(auth.schoolId, id, body);
  }

  @Delete(':id')
  @RequirePermission('group.update')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.remove(auth.schoolId, id);
  }

  @Post(':id/members')
  @RequirePermission('group.update')
  async addMembers(@Param('id') id: string, @Body(new ZodValidationPipe(addGroupMembersSchema)) body: AddGroupMembersInput, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.addMembers(auth.schoolId, id, body);
  }

  @Delete(':id/members/:studentId')
  @RequirePermission('group.update')
  async removeMember(@Param('id') id: string, @Param('studentId') studentId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.groups.removeMember(auth.schoolId, id, studentId);
  }
}
