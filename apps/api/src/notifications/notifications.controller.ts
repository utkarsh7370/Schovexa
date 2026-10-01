import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { NotificationsService } from './notifications.service';

// "My notifications": addressed to the signed-in user and only ever
// readable by them, so — like My profile — there is no permission to hold;
// every query is filtered by auth.userId from the verified session.
@Controller('notifications')
@UseGuards(AuthGuard, SchoolContextGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async mine(@CurrentAuthContext() auth: AuthContext) {
    return this.notificationsService.listMine(auth.schoolId, auth.userId);
  }

  // Declared before ':id/read' so "read-all" is never taken for an id.
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@CurrentAuthContext() auth: AuthContext) {
    return this.notificationsService.markAllRead(auth.schoolId, auth.userId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async read(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.notificationsService.markRead(auth.schoolId, auth.userId, id);
  }
}
