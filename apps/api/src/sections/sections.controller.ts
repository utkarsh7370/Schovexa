import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createSectionSchema, updateSectionSchema } from '@schovexa/validation';
import type { CreateSectionInput, UpdateSectionInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SectionsService } from './sections.service';
import type { AuthContext } from '../authorization/authorization.types';

// Sections are a sub-resource of Class and share the `class.*` permission
// keys (docs/permissions.md §2 lists no separate `section.*` key) —
// resource-level authorization still checks the 'Section' ResourceType so
// OWN_CLASS-scoped roles resolve against the actual section, not the class.
@Controller()
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class SectionsController {
  constructor(
    private readonly sectionsService: SectionsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('classes/:classId/sections')
  @RequirePermission('class.view')
  async listForClass(@Param('classId') classId: string, @CurrentAuthContext() auth: AuthContext) {
    return this.sectionsService.listForClass(auth.schoolId, classId);
  }

  @Post('classes/:classId/sections')
  @RequirePermission('class.create')
  async create(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(createSectionSchema)) body: CreateSectionInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.sectionsService.create(auth.schoolId, classId, body);
  }

  @Patch('sections/:id')
  @RequirePermission('class.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSectionSchema)) body: UpdateSectionInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Section', id);
    return this.sectionsService.update(auth.schoolId, id, body);
  }
}
