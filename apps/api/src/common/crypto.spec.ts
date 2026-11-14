import { generateOpaqueToken, generateOtpCode, hmac, safeEqualHex, sha256 } from './crypto.js';

describe('crypto helpers', () => {
  it('generates 6-digit codes, keeping leading zeros', () => {
    for (let i = 0; i < 500; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });

  it('generates unique 43-char base64url refresh tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateOpaqueToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('keys code hashes with the server pepper', () => {
    expect(hmac('pepper-a', 'x@y.com:123456')).not.toBe(hmac('pepper-b', 'x@y.com:123456'));
    expect(sha256('a')).toHaveLength(64);
  });

  it('compares digests safely, including different lengths', () => {
    const a = sha256('one');
    expect(safeEqualHex(a, sha256('one'))).toBe(true);
    expect(safeEqualHex(a, sha256('two'))).toBe(false);
    expect(safeEqualHex(a, a.slice(0, 10))).toBe(false);
  });
});
