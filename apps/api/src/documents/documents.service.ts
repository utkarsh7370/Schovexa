import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SchoolSettingsService } from '../school-settings/school-settings.service';

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
// The hard ceiling, enforced while the upload streams in. Each school sets
// its own (lower or equal) limit in its document settings.
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

const TYPE_LABELS: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG' };

// What the file's own first bytes say it is. The browser-supplied
// Content-Type is just a label the uploader chose, so it is checked against
// the content — a script renamed "report.pdf" is refused, and the type that
// is stored (and later served) is the detected one, never the claimed one.
export function sniffDocumentType(buffer: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: SchoolSettingsService,
  ) {}

  /** What this school accepts — for the upload form and the "required documents" checklist. */
  async config(schoolId: string) {
    const s = await this.settings.get(schoolId);
    return {
      maxSizeMb: s.documentMaxSizeMb,
      allowedTypes: s.allowedDocumentTypes,
      categories: s.documentCategories,
      requiredStudentDocuments: s.requiredStudentDocuments,
    };
  }

  /** `categories` limits the list to those categories (case-insensitive) — for roles that may open only some documents. */
  async listForOwner(schoolId: string, ownerType: string, ownerId: string, categories?: string[]) {
    return this.prisma.document.findMany({
      where: { schoolId, ownerType, ownerId, deletedAt: null, ...(categories ? { OR: categories.map((c) => ({ category: { equals: c, mode: 'insensitive' as const } })) } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    schoolId: string,
    ownerType: string,
    ownerId: string,
    uploadedById: string,
    file: Express.Multer.File | undefined,
    category?: string,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'No file was uploaded.' });
    }
    const rules = await this.settings.get(schoolId);
    const allowed = rules.allowedDocumentTypes.filter((t) => ALLOWED_DOCUMENT_MIME_TYPES.has(t));
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Unsupported file type. Allowed: ${allowed.map((t) => TYPE_LABELS[t]).join(', ')}.`,
      });
    }
    if (file.size > rules.documentMaxSizeMb * 1024 * 1024) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `File is too large (max ${rules.documentMaxSizeMb} MB).` });
    }
    // A category is optional, but when given it must be one the school uses.
    let canonicalCategory: string | null = null;
    if (category && category.trim()) {
      canonicalCategory = rules.documentCategories.find((c) => c.toLowerCase() === category.trim().toLowerCase()) ?? null;
      if (!canonicalCategory) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `“${category.trim().slice(0, 40)}” isn’t one of this school’s document categories.` });
      }
    }

    const detected = sniffDocumentType(file.buffer);
    if (!detected || detected !== file.mimetype || !allowed.includes(detected)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'This file doesn’t look like a real PDF, JPEG or PNG. Check it opens on your computer, then try again.',
      });
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
        mimeType: detected,
        sizeBytes: file.size,
        category: canonicalCategory,
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
    return { document, stream: await this.storage.getObjectStream(document.fileKey) };
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
