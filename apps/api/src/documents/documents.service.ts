import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listForOwner(schoolId: string, ownerType: string, ownerId: string) {
    return this.prisma.document.findMany({
      where: { schoolId, ownerType, ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    schoolId: string,
    ownerType: string,
    ownerId: string,
    uploadedById: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'No file was uploaded.' });
    }
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Unsupported file type. Allowed: PDF, JPEG, PNG.',
      });
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'File is too large (max 10MB).' });
    }

    const key = this.storage.buildKey(schoolId, ownerType, ownerId, file.originalname);
    await this.storage.putObject(key, file.buffer);

    return this.prisma.document.create({
      data: {
        schoolId,
        ownerType,
        ownerId,
        fileKey: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById,
      },
    });
  }

  async getForDownload(schoolId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, schoolId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    return { document, stream: this.storage.getObjectStream(document.fileKey) };
  }

  // Soft-delete only, per the deletedAt convention used everywhere else
  // in this codebase — the underlying file is kept (documents may be
  // subject to retention requirements) rather than hard-deleted here.
  async remove(schoolId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, schoolId, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    await this.prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    return { id: documentId };
  }
}
