import { Readable } from 'stream';
import { rm } from 'fs/promises';
import { join } from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

// Auto-mocking the whole module would also mock the Command classes
// (PutObjectCommand etc.), and an auto-mocked class never runs its real
// constructor — so the `.input` property the assertions below check for
// would never get set. Keep the real Command classes; mock only the
// client that actually performs I/O.
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});

describe('StorageService', () => {
  const originalEnv = { ...process.env };
  const testUploadsDir = join(process.cwd(), 'test-uploads-storage-spec');

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(testUploadsDir, { recursive: true, force: true });
  });

  describe('local-disk adapter (no STORAGE_* configured)', () => {
    it('round-trips put -> get -> delete on the filesystem', async () => {
      delete process.env.STORAGE_ENDPOINT;
      delete process.env.STORAGE_BUCKET;
      process.env.UPLOADS_DIR = testUploadsDir;
      const service = new StorageService();

      const key = service.buildKey('school-1', 'Student', 'student-1', 'report card.pdf');
      expect(key).toMatch(/^school-1\/Student\/student-1\/[0-9a-f-]+-report_card\.pdf$/);

      await service.putObject(key, Buffer.from('hello'));
      const stream = await service.getObjectStream(key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      expect(Buffer.concat(chunks).toString()).toBe('hello');

      await service.deleteObject(key);
      // createReadStream never rejects its own promise — fs errors on a
      // missing file surface asynchronously as an 'error' event once the
      // stream is read, not as a rejected getObjectStream() call.
      const missingStream = await service.getObjectStream(key);
      await expect(
        (async () => {
          let bytesRead = 0;
          for await (const chunk of missingStream) {
            bytesRead += (chunk as Buffer).length;
          }
          return bytesRead;
        })(),
      ).rejects.toThrow();
    });
  });

  describe('S3 adapter (STORAGE_ENDPOINT + STORAGE_BUCKET configured)', () => {
    it('sends the right S3 commands instead of touching the filesystem', async () => {
      process.env.STORAGE_ENDPOINT = 'https://s3.example.test';
      process.env.STORAGE_BUCKET = 'schovexa-uploads';
      process.env.STORAGE_ACCESS_KEY_ID = 'key';
      process.env.STORAGE_SECRET_ACCESS_KEY = 'secret';
      process.env.STORAGE_REGION = 'auto';

      const send = jest.fn();
      (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));

      const service = new StorageService();
      const key = 'school-1/Student/student-1/file.pdf';

      send.mockResolvedValueOnce({});
      await service.putObject(key, Buffer.from('hello'));
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ Bucket: 'schovexa-uploads', Key: key }) }),
      );

      send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('hello')]) });
      const stream = await service.getObjectStream(key);
      expect(stream).toBeInstanceOf(Readable);

      send.mockResolvedValueOnce({});
      await service.deleteObject(key);
      expect(send).toHaveBeenCalledTimes(3);
    });
  });
});
