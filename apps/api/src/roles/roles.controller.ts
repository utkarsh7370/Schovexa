import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createRoleSchema, updateRoleSchema } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RolesService } from './roles.service';
import type { AuthContext } from '../authorization/authorization.types';
import type { CreateRoleInput, UpdateRoleInput } from '@schovexa/validation';

@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('roles')
  @RequirePermission('role.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.rolesService.listRoles(auth.schoolId);
  }

  @Get('permissions')
  @RequirePermission('role.view')
  async listPermissions() {
    return this.rolesService.listPermissionCatalog();
  }

  @Post('roles')
  @RequirePermission('role.create')
  async create(@Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput, @CurrentAuthContext() auth: AuthContext) {
    return this.rolesService.createRole(auth.schoolId, body.name, body.permissions);
  }

  @Patch('roles/:id')
  @RequirePermission('role.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Role', id);
    return this.rolesService.updateRole(auth.schoolId, id, body.name, body.permissions);
  }
}
