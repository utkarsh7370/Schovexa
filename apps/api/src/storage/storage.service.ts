import { Injectable } from '@nestjs/common';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

interface StorageAdapter {
  putObject(key: string, buffer: Buffer): Promise<void>;
  getObjectStream(key: string): Promise<Readable>;
  deleteObject(key: string): Promise<void>;
}

// Interim adapter — the default until STORAGE_ENDPOINT/STORAGE_BUCKET
// are configured. Never used once real object storage is wired up for
// a deployment: files written here live on whatever single instance's
// disk happened to handle the upload, don't survive a redeploy, and
// aren't backed up.
class LocalDiskAdapter implements StorageAdapter {
  private readonly root = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');

  async putObject(key: string, buffer: Buffer): Promise<void> {
    const filePath = join(this.root, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  async getObjectStream(key: string): Promise<Readable> {
    return createReadStream(join(this.root, key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}

// Real object storage, behind the S3 API — works against AWS S3 itself
// or any S3-compatible endpoint (Cloudflare R2, Backblaze B2, MinIO for
// self-hosting) by pointing STORAGE_ENDPOINT at that provider; nothing
// here is AWS-specific beyond the wire protocol.
class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = process.env.STORAGE_BUCKET!;
    this.client = new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      endpoint: process.env.STORAGE_ENDPOINT,
      // Path-style addressing is required by most non-AWS S3-compatible
      // providers (R2, MinIO, B2); AWS S3 itself accepts it too.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
    });
  }

  async putObject(key: string, buffer: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer }));
  }

  async getObjectStream(key: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // In the Node.js runtime (never the browser build), Body is always a
    // Readable — the SDK's own type is broader (it also covers the
    // browser/React Native builds) to match one shared type across
    // environments.
    return result.Body as Readable;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// Object storage seam (docs/architecture.md §8). Every call site depends
// on this class's methods, never on a filesystem path or an S3 client
// directly — which adapter actually handles a given call is decided once,
// here, from environment configuration; DocumentsService and everything
// else are unaffected either way.
//
// Documents are never served from a public URL (docs/architecture.md
// §8) — DocumentsController's download endpoint requires the same
// session + permission + tenant checks as any other resource, then
// streams through this service, rather than either adapter issuing a
// bare (unauthenticated) signed URL.
@Injectable()
export class StorageService {
  private readonly adapter: StorageAdapter = process.env.STORAGE_ENDPOINT && process.env.STORAGE_BUCKET
    ? new S3StorageAdapter()
    : new LocalDiskAdapter();

  buildKey(schoolId: string, ownerType: string, ownerId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${schoolId}/${ownerType}/${ownerId}/${randomUUID()}-${safeName}`;
  }

  async putObject(key: string, buffer: Buffer): Promise<void> {
    return this.adapter.putObject(key, buffer);
  }

  async getObjectStream(key: string): Promise<Readable> {
    return this.adapter.getObjectStream(key);
  }

  async deleteObject(key: string): Promise<void> {
    return this.adapter.deleteObject(key);
  }
}
