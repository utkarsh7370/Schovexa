import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { parentQuerySchema, replyMessageSchema, sendMessageSchema } from '@schovexa/validation';
import type { ParentQueryInput, ReplyMessageInput, SendMessageInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import type { AuthContext } from '../authorization/authorization.types';
import { parsePagination } from '../common/pagination.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @RequirePermission('message.view')
  list(@Query('box') box: string | undefined, @Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @CurrentAuthContext() auth: AuthContext) {
    const { page: p, pageSize: ps } = parsePagination(page, pageSize);
    return this.messages.list(auth, box === 'sent' ? 'sent' : 'inbox', p, ps);
  }

  @Get('unread-count')
  @RequirePermission('message.view')
  unread(@CurrentAuthContext() auth: AuthContext) {
    return this.messages.unreadCount(auth);
  }

  @Get(':id')
  @RequirePermission('message.view')
  thread(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.messages.thread(auth, id);
  }

  // Teacher → parents of a student or class.
  @Post()
  @RequirePermission('message.send')
  send(@Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput, @CurrentAuthContext() auth: AuthContext) {
    return this.messages.send(auth, body);
  }

  // Parent → teachers of their own child. (A teacher's scope never resolves a student as "their child".)
  @Post('query')
  @RequirePermission('message.send')
  query(@Body(new ZodValidationPipe(parentQuerySchema)) body: ParentQueryInput, @CurrentAuthContext() auth: AuthContext) {
    return this.messages.query(auth, body);
  }

  @Post(':id/reply')
  @RequirePermission('message.send')
  reply(@Param('id') id: string, @Body(new ZodValidationPipe(replyMessageSchema)) body: ReplyMessageInput, @CurrentAuthContext() auth: AuthContext) {
    return this.messages.reply(auth, id, body.body);
  }
}
