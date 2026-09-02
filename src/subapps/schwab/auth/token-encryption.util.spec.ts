import { decryptToken, encryptToken } from './token-encryption.util';

describe('token-encryption.util', () => {
  const secret = 'test-secret-key';

  it('round-trips a plaintext token', () => {
    const plaintext = 'super-secret-access-token-value';
    const encrypted = encryptToken(plaintext, secret);

    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted, secret)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-token';
    const first = encryptToken(plaintext, secret);
    const second = encryptToken(plaintext, secret);

    expect(first).not.toBe(second);
    expect(decryptToken(first, secret)).toBe(plaintext);
    expect(decryptToken(second, secret)).toBe(plaintext);
  });

  it('fails to decrypt with the wrong secret', () => {
    const encrypted = encryptToken('some-token', secret);
    expect(() => decryptToken(encrypted, 'wrong-secret')).toThrow();
  });
});
