import { SetMetadata } from '@nestjs/common';

export const SENSITIVE_ACTION_KEY = 'schovexa:sensitive-action';

// Marks a route as a sensitive action: one that changes who can do what, or
// who is in the school (inviting people, changing or disabling accounts,
// editing roles). On top of holding the permission, the person must have
// entered their password recently (POST /auth/reauth, or a fresh sign-in) —
// so a session left open on a shared computer, or a stolen cookie, can't be
// used to hand out access — and, where the deployment requires it, must have
// a verified email address. Enforced in PermissionGuard.
export const SensitiveAction = () => SetMetadata(SENSITIVE_ACTION_KEY, true);
