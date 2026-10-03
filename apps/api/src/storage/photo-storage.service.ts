import { BadRequestException, Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import { sniffDocumentType } from '../documents/documents.service';
import { StorageService } from './storage.service';

export const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;

/** Profile photos (a student's, a staff member's): checked by content, stored privately, served only through the API. */
@Injectable()
export class PhotoStorageService {
  constructor(private readonly storage: StorageService) {}

  /** Validates and stores a JPEG/PNG; removes the one it replaces. Returns the new storage key. */
  async save(schoolId: string, ownerType: string, ownerId: string, file: Express.Multer.File | undefined, previousKey?: string | null): Promise<string> {
    if (!file) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Choose a photo to upload.' });
    if (file.size > MAX_PHOTO_SIZE_BYTES) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The photo must be under 2 MB.' });
    const type = sniffDocumentType(file.buffer);
    if (type !== 'image/png' && type !== 'image/jpeg') throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'The photo must be a JPEG or PNG image.' });
    const key = this.storage.buildKey(schoolId, ownerType, ownerId, type === 'image/png' ? 'photo.png' : 'photo.jpg');
    await this.storage.putObject(key, file.buffer);
    if (previousKey) await this.remove(previousKey);
    return key;
  }

  async open(key: string): Promise<{ contentType: string; stream: Readable }> {
    return { contentType: key.endsWith('.png') ? 'image/png' : 'image/jpeg', stream: await this.storage.getObjectStream(key) };
  }

  async remove(key: string): Promise<void> {
    await this.storage.deleteObject(key).catch(() => undefined);
  }
}
