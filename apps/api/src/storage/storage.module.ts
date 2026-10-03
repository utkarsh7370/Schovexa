import { Global, Module } from '@nestjs/common';
import { PhotoStorageService } from './photo-storage.service';
import { StorageService } from './storage.service';

// @Global() because Documents is the only consumer today but any future
// module with file uploads (staff photos, receipts, ...) needs the same
// single storage seam — matching AuthorizationModule's existing pattern.
@Global()
@Module({
  providers: [StorageService, PhotoStorageService],
  exports: [StorageService, PhotoStorageService],
})
export class StorageModule {}
