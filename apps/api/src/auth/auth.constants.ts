// Timing constants for docs/authentication.md's session/token design.
// Kept centralized and small — exact values are not architecturally
// load-bearing (per that doc), just consistent and named instead of
// scattered magic numbers.

export const SESSION_COOKIE_NAME = 'schovexa_session';

// Sliding expiration: touched forward on every validated request.
// MVP simplification: no separate hard absolute cap is tracked
// alongside the sliding window (docs/authentication.md notes exact
// values are "not load-bearing for this design").
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// One generic message for every login failure mode — wrong password,
// unknown email, or a non-ACTIVE account status — per
// docs/authentication.md §7: message differences are themselves a user-
// enumeration channel, so all three cases must be indistinguishable.
export const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
