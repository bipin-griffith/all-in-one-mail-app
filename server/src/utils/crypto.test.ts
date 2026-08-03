import { decrypt, encrypt } from './crypto';

describe('crypto (AES-256-GCM token encryption)', () => {
  it('round-trips a plaintext value', () => {
    const plain = 'ya29.a0Af-fake-google-access-token';
    const cipherText = encrypt(plain);

    expect(cipherText).not.toEqual(plain);
    expect(decrypt(cipherText)).toEqual(plain);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plain = 'same-input';
    expect(encrypt(plain)).not.toEqual(encrypt(plain));
  });

  it('throws on a tampered payload', () => {
    const cipherText = encrypt('secret');
    const tampered = cipherText.slice(0, -2) + '00';
    expect(() => decrypt(tampered)).toThrow();
  });
});
