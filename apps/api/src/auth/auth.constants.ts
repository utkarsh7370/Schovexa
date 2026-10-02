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
// "Keep me signed in": a month of inactivity allowed instead of half a day.
export const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Hard caps measured from sign-in, however active the session is — a stolen
// cookie can't be kept alive forever by using it. docs/authentication.md §2.
export const SESSION_ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const REMEMBER_SESSION_ABSOLUTE_MAX_MS = 90 * 24 * 60 * 60 * 1000;

// Login protection: this many failed attempts for one email (or from one
// address) inside the window locks further attempts until it passes.
export const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES_PER_EMAIL = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 30;

// How recently the person must have entered their password for a sensitive
// action (inviting staff, changing roles…). Override with REAUTH_WINDOW_MINUTES.
export const REAUTH_WINDOW_MS = Math.max(1, Number(process.env.REAUTH_WINDOW_MINUTES ?? 10)) * 60 * 1000;

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
// Don't send another verification email sooner than this.
export const EMAIL_VERIFICATION_COOLDOWN_MS = 60 * 1000;

// Whether sensitive actions wait for a verified email. On by default in
// production; off by default elsewhere so local development and the demo
// seed work without a mail server. REQUIRE_EMAIL_VERIFICATION=true|false
// overrides either way.
export function requireEmailVerification(): boolean {
  const flag = process.env.REQUIRE_EMAIL_VERIFICATION;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// One generic message for every login failure mode — wrong password,
// unknown email, or a non-ACTIVE account status — per
// docs/authentication.md §7: message differences are themselves a user-
// enumeration channel, so all three cases must be indistinguishable.
export const GENERIC_LOGIN_ERROR = 'Invalid email or password.';

// Shared by every controller that sets the session cookie (login,
// school registration's auto-login, ...) — one definition, not one per
// call site.
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// A normal sign-in sets a SESSION cookie (no maxAge: the browser forgets it
// when it closes). "Keep me signed in" sets a persistent 30-day cookie. The
// server-side session row enforces the real lifetime either way.
export function sessionCookieOptions(rememberMe: boolean) {
  return rememberMe ? { ...BASE_COOKIE_OPTIONS, maxAge: REMEMBER_SESSION_TTL_MS } : { ...BASE_COOKIE_OPTIONS };
}
export const SESSION_COOKIE_OPTIONS = sessionCookieOptions(false);
// Options clearCookie needs to match for the browser to actually drop it.
export const SESSION_COOKIE_CLEAR_OPTIONS = { ...BASE_COOKIE_OPTIONS };
