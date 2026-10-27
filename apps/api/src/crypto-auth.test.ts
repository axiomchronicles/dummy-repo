import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateBase32Secret,
  generateTotp,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './crypto-auth';

describe('Crypto Authentication Suite', () => {
  it('hashes and securely verifies passwords', () => {
    const pwd = 'StrongSecurePassword123!';
    const hash = hashPassword(pwd);
    expect(hash).toContain('scrypt$');
    expect(verifyPassword(pwd, hash)).toBe(true);
    expect(verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('generates valid base32 secrets and verifies RFC 6238 TOTP codes', () => {
    const secret = generateBase32Secret(20);
    expect(secret.length).toBe(32);
    const code = generateTotp(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  it('handles window drift in TOTP verification', () => {
    const secret = generateBase32Secret(20);
    // 30 seconds ago
    const pastCode = generateTotp(secret, 30, Date.now() - 30000);
    expect(verifyTotp(secret, pastCode, 1)).toBe(true);
    // 90 seconds ago (outside window +-1)
    const tooOldCode = generateTotp(secret, 30, Date.now() - 90000);
    expect(verifyTotp(secret, tooOldCode, 1)).toBe(false);
  });

  it('generates and hashes recovery codes', () => {
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    expect(plainCodes.length).toBe(8);
    expect(hashedCodes.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(plainCodes[i]).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
      expect(hashRecoveryCode(plainCodes[i])).toBe(hashedCodes[i]);
    }
  });
});
