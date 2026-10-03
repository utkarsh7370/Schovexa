import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createSubstitutionSchema, createTimetableSlotSchema, updateTimetableSlotSchema } from '@schovexa/validation';
import type { CreateSubstitutionInput, CreateTimetableSlotInput, UpdateTimetableSlotInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TimetableService } from './timetable.service';

const text = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

@Controller('timetable')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get()
  @RequirePermission('timetable.view')
  list(@Query('sectionId') sectionId: string | undefined, @Query('teacherId') teacherId: string | undefined, @Query('mine') mine: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.list(auth, { sectionId: text(sectionId), teacherId: text(teacherId), mine: mine === '1' || mine === 'true' });
  }

  // "My day": the signed-in teacher's lessons on a date, with cover applied.
  @Get('today')
  @RequirePermission('timetable.view')
  today(@Query('date') date: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.mySchedule(auth, text(date));
  }

  @Get('substitutions')
  @RequirePermission('timetable.view')
  substitutions(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'from and to are required (2026-10-01).' });
    return this.timetable.listSubstitutions(auth, from, to);
  }

  @Post()
  @RequirePermission('timetable.manage')
  create(@Body(new ZodValidationPipe(createTimetableSlotSchema)) body: CreateTimetableSlotInput, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.create(auth, body);
  }

  @Post('substitutions')
  @RequirePermission('timetable.manage')
  createSubstitution(@Body(new ZodValidationPipe(createSubstitutionSchema)) body: CreateSubstitutionInput, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.createSubstitution(auth, body);
  }

  @Delete('substitutions/:id')
  @RequirePermission('timetable.manage')
  removeSubstitution(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.removeSubstitution(auth, id);
  }

  @Patch(':id')
  @RequirePermission('timetable.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateTimetableSlotSchema)) body: UpdateTimetableSlotInput, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.update(auth, id, body);
  }

  @Delete(':id')
  @RequirePermission('timetable.manage')
  remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.timetable.remove(auth, id);
  }
}
