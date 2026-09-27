import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

// Object storage seam (docs/architecture.md §8): "S3-compatible object
// storage, provider decision open". This local-disk adapter is the
// interim implementation behind that seam — every call site depends on
// this class's methods, not the filesystem directly, so swapping in a
// real S3-compatible client later (once a provider is chosen) touches
// only this file. Keys are opaque strings; callers never construct
// filesystem paths themselves.
//
// Documents are never served from a public URL (docs/architecture.md
// §8) — DocumentsController's download endpoint requires the same
// session + permission + tenant checks as any other resource, then
// streams through this service, rather than this service issuing a
// bare (unauthenticated) signed URL. That is a stricter, not weaker,
// reading of "no permanently public URLs" for the MVP where no real
// object storage provider (with its own presigned-URL support) is
// wired up yet.
@Injectable()
export class StorageService {
  private readonly root = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');

  buildKey(schoolId: string, ownerType: string, ownerId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${schoolId}/${ownerType}/${ownerId}/${randomUUID()}-${safeName}`;
  }

  async putObject(key: string, buffer: Buffer): Promise<void> {
    const filePath = join(this.root, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  getObjectStream(key: string) {
    return createReadStream(join(this.root, key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}
