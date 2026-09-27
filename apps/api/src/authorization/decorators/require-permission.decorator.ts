import { SetMetadata } from '@nestjs/common';

export const PERMISSION_METADATA_KEY = 'schovexa:permission';

// Declares which permission key a route requires — read by PermissionGuard.
// This is the ONLY place a route states its permission requirement; never
// duplicate this check inside a controller/service (docs/authorization.md §1).
export const RequirePermission = (permissionKey: string) =>
  SetMetadata(PERMISSION_METADATA_KEY, permissionKey);
