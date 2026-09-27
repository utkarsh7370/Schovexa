import { randomBytes, createHash } from 'crypto';

// Opaque, high-entropy tokens for sessions and reset/invite/verification
// links. Only the hash is ever persisted (docs/authentication.md §2, §4) —
// the raw value exists only in the cookie or the emailed link. SHA-256 is
// used (a FAST hash), not Argon2id — see docs/security-scalability-review
// .md finding F5: a random token's security is its entropy, not guessing
// resistance, so a slow password-hashing algorithm buys nothing here.

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
