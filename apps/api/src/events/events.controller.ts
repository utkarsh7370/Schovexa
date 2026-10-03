import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createEventSchema } from '@schovexa/validation';
import type { CreateEventInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermission('event.view')
  list(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    return this.events.list(auth, from, to);
  }

  @Post()
  @RequirePermission('event.manage')
  create(@Body(new ZodValidationPipe(createEventSchema)) body: CreateEventInput, @CurrentAuthContext() auth: AuthContext) {
    return this.events.create(auth, body);
  }

  @Patch(':id')
  @RequirePermission('event.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(createEventSchema.innerType().partial())) body: Partial<CreateEventInput>, @CurrentAuthContext() auth: AuthContext) {
    return this.events.update(auth, id, body);
  }

  @Delete(':id')
  @RequirePermission('event.manage')
  remove(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.events.remove(auth, id);
  }
}
