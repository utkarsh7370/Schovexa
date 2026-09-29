import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createInvitationSchema, updateMembershipSchema } from '@schovexa/validation';
import type { CreateInvitationInput, UpdateMembershipInput } from '@schovexa/validation';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { requestMeta } from '../common/request-meta.util';
import { sendCsv, toCsv } from '../common/csv.util';
import { MembershipsService } from './memberships.service';
import type { AuthContext } from '../authorization/authorization.types';

@Controller('memberships')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @RequirePermission('user.view')
  async list(@CurrentAuthContext() auth: AuthContext) {
    return this.membershipsService.listMemberships(auth.schoolId);
  }

  @Get('export')
  @RequirePermission('user.view')
  async exportCsv(@CurrentAuthContext() auth: AuthContext, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const memberships = await this.membershipsService.listMemberships(auth.schoolId);
    const csv = toCsv(memberships, [
      { key: (m) => m.user.firstName, header: 'First Name' },
      { key: (m) => m.user.lastName, header: 'Last Name' },
      { key: (m) => m.user.email, header: 'Email' },
      { key: (m) => m.role.name, header: 'Role' },
      { key: 'status', header: 'Membership Status' },
      { key: (m) => m.user.status, header: 'Account Status' },
    ]);
    return sendCsv(res, csv, 'staff.csv');
  }

  @Post('invitations')
  @RequirePermission('user.create')
  async invite(
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.membershipsService.createInvitation(auth.schoolId, body, requestMeta(req));
  }

  @Patch(':id')
  @RequirePermission('user.update')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMembershipSchema)) body: UpdateMembershipInput,
    @CurrentAuthContext() auth: AuthContext,
    @Req() req: Request,
  ) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', id);
    return this.membershipsService.updateMembership(auth.schoolId, id, body.roleId, requestMeta(req));
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user.disable')
  async disable(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', id);
    return this.membershipsService.setMembershipStatus(auth.schoolId, id, 'DISABLED', requestMeta(req));
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user.update')
  async reactivate(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    await this.authorizationService.authorizeResource(auth, 'SchoolMembership', id);
    return this.membershipsService.setMembershipStatus(auth.schoolId, id, 'ACTIVE', requestMeta(req));
  }
}
