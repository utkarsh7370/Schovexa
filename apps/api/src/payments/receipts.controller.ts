import { Controller, Get, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SchoolContextGuard } from '../authorization/guards/school-context.guard';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { CurrentAuthContext } from '../authorization/decorators/current-auth-context.decorator';
import { requestMeta } from '../common/request-meta.util';
import { ReceiptsService } from './receipts.service';
import type { AuthContext } from '../authorization/authorization.types';

// receipt.view covers viewing, downloading and (re)printing. Staff have it
// school-wide; a parent has it for their own children's payments only (the
// service checks which student the receipt belongs to).
@Controller('receipts')
@UseGuards(AuthGuard, SchoolContextGuard, PermissionGuard)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get(':id')
  @RequirePermission('receipt.view')
  async get(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext) {
    return this.receipts.get(auth, id);
  }

  @Get(':id/pdf')
  @RequirePermission('receipt.view')
  async pdf(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { buffer, fileName } = await this.receipts.pdf(auth, id, requestMeta(req));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"` });
    return new StreamableFile(buffer);
  }

  @Post(':id/reprint')
  @RequirePermission('receipt.view')
  async reprint(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.receipts.reprint(auth, id, requestMeta(req));
  }

  @Post(':id/notify')
  @RequirePermission('feeNotice.send')
  async notify(@Param('id') id: string, @CurrentAuthContext() auth: AuthContext, @Req() req: Request) {
    return this.receipts.notify(auth, id, requestMeta(req));
  }
}
