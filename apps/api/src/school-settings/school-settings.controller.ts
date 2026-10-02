import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateSchoolSettingsSchema } from '@schovexa/validation';
import type { UpdateSchoolSettingsInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SchoolSettingsService } from './school-settings.service';
import type { AuthContext } from '../authorization/authorization.types';

// Timings, working days, attendance, fee, notification and document rules.
// Anyone who can see school settings can read them; changing them is
// school.update (the Director by default).
@Controller('school-settings')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class SchoolSettingsController {
  constructor(private readonly settings: SchoolSettingsService) {}

  @Get()
  @RequirePermission('school.view')
  async get(@CurrentAuthContext() auth: AuthContext) {
    return this.settings.get(auth.schoolId);
  }

  @Patch()
  @RequirePermission('school.update')
  async update(
    @Body(new ZodValidationPipe(updateSchoolSettingsSchema)) body: UpdateSchoolSettingsInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.settings.update(auth.schoolId, body);
  }
}
