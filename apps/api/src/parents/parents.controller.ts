import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { createParentSchema, inviteParentSchema } from '@schovexa/validation';
import type { CreateParentInput, InviteParentInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requestMeta } from '../common/request-meta.util';
import { ParentsService } from './parents.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('parents')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ParentsController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('parent.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.parentsService.list(auth.schoolId);
  }

  @Get(':id')
  @RequirePermission('parent.view')
  async findOne(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    await this.authorizationService.authorizeResource(auth, 'Parent', id);
    return this.parentsService.findOne(auth.schoolId, id);
  }

  @Post()
  @RequirePermission('parent.create')
  async create(
    @Body(new ZodValidationPipe(createParentSchema)) body: CreateParentInput,
    @CurrentAuthContext() auth: AuthContext,
  ) {
    return this.parentsService.create(auth.schoolId, body);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('parent.update')
  async invite(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inviteParentSchema)) body: InviteParentInput,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
  ) {
    await this.authorizationService.authorizeResource(auth, 'Parent', id);
    return this.parentsService.invite(auth.schoolId, id, body, requestMeta(req));
  }
}
