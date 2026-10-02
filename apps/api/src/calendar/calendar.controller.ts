import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { CalendarService } from './calendar.service';
import type { AuthContext } from '../authorization/authorization.types';

// Read-only, for everyone who can see holidays (all built-in roles).
@Controller('calendar')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermission('holiday.view')
  async range(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.calendar.range(auth.schoolId, from, to);
  }
}
