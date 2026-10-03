import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Files attached to teaching records (homework, assignments, study material, leave).
 * They are ordinary Documents with an `ownerType` naming the record. The CALLER must have
 * already authorised the owning record — this service only moves bytes — and a document is
 * only ever reachable through its own owner, so an id from another record is a 404.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  list(schoolId: string, ownerType: string, ownerId: string) {
    return this.prisma.document.findMany({
      where: { schoolId, ownerType, ownerId, deletedAt: null },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** For list screens: how many files each record has, in one query. */
  async counts(schoolId: string, ownerType: string, ownerIds: string[]): Promise<Map<string, number>> {
    if (ownerIds.length === 0) return new Map();
    const rows = await this.prisma.document.groupBy({ by: ['ownerId'], where: { schoolId, ownerType, ownerId: { in: ownerIds }, deletedAt: null }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.ownerId, r._count._all]));
  }

  async upload(schoolId: string, ownerType: string, ownerId: string, userId: string, file: Express.Multer.File | undefined) {
    const doc = await this.documents.upload(schoolId, ownerType, ownerId, userId, file);
    return { id: doc.id, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, createdAt: doc.createdAt };
  }

  async stream(schoolId: string, ownerType: string, ownerId: string, documentId: string, res: Response): Promise<StreamableFile> {
    const found = await this.prisma.document.findFirst({ where: { id: documentId, schoolId, ownerType, ownerId, deletedAt: null } });
    if (!found) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    const { document, stream } = await this.documents.getForDownload(schoolId, documentId);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${document.fileName.replace(/[^\w.\- ]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(stream);
  }

  async remove(schoolId: string, ownerType: string, ownerId: string, documentId: string): Promise<{ id: string }> {
    const found = await this.prisma.document.findFirst({ where: { id: documentId, schoolId, ownerType, ownerId, deletedAt: null } });
    if (!found) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    return this.documents.remove(schoolId, documentId);
  }
}
