import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createHolidaySchema, updateHolidaySchema } from '@schovexa/validation';
import type { CreateHolidayInput, UpdateHolidayInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { HolidaysService } from './holidays.service';
import type { AuthContext } from '../authorization/authorization.types';

// Everyone with holiday.view (all built-in roles) reads the calendar;
// only roles granted holiday.create / update / delete (Director, and
// Principal by default) change it. A holiday belongs to a whole school, so
// there is no per-resource scope to resolve — the school id from the
// session is the only filter, which also makes a cross-tenant id a 404.
@Controller('holidays')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Get()
  @RequirePermission('holiday.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.holidaysService.list(auth.schoolId);
  }

  // Declared before ':id' routes so "next" is never read as an id.
  @Get('next')
  @RequirePermission('holiday.view')
  async next(@CurrentAuthContext() auth: AuthContext) {
    return this.holidaysService.next(auth.schoolId);
  }

  @Post()
  @RequirePermission('holiday.create')
  async create(
    @Body(new ZodValidationPipe(createHolidaySchema)) body: CreateHolidayInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.holidaysService.create(auth.schoolId, auth.userId, body);
  }

  @Patch(':id')
  @RequirePermission('holiday.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateHolidaySchema)) body: UpdateHolidayInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.holidaysService.update(auth.schoolId, id, body);
  }

  @Delete(':id')
  @RequirePermission('holiday.delete')
  async remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.holidaysService.remove(auth.schoolId, id);
  }
}
