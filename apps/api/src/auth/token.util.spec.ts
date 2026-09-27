import { generateOpaqueToken, hashToken } from './token.util';

describe('token.util', () => {
  it('generates high-entropy, unique tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(64); // 32 bytes hex-encoded
  });

  it('hashes deterministically (same input -> same hash)', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateOpaqueToken())).not.toEqual(hashToken(generateOpaqueToken()));
  });

  it('never returns the raw token as its own hash', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).not.toEqual(token);
  });
});
