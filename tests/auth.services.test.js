import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from '../src/services/password.service.js';
import {
  generateVerificationToken,
  generatePasswordResetToken,
  hashToken,
} from '../src/services/token.service.js';
import { emailService } from '../src/services/email.service.js';

describe('Phase 3: Password, Token, and Email Services', () => {

  describe('Password Service (bcryptjs & byte-length guards)', () => {
    it('should successfully hash a valid password and verify candidate match', async () => {
      const password = 'CorrectHorseBatteryStaple123!';
      const hash = await hashPassword(password);

      assert.ok(hash);
      assert.notEqual(hash, password);
      assert.match(hash, /^\$2[aby]\$\d+\$/); // bcrypt hash format

      const isMatch = await comparePassword(password, hash);
      assert.equal(isMatch, true);

      const isWrong = await comparePassword('WrongPassword123!', hash);
      assert.equal(isWrong, false);
    });

    it('should reject passwords shorter than 8 characters', () => {
      assert.throws(
        () => validatePasswordStrength('short1!'),
        /at least 8 characters long/
      );
    });

    it('should strictly reject passwords exceeding bcrypt 72-byte input limit', () => {
      // 73 ASCII characters = 73 bytes
      const longPassword = 'A'.repeat(73);
      assert.throws(
        () => validatePasswordStrength(longPassword),
        /exceeds the maximum supported length of 72 bytes/
      );

      // Multi-byte characters (e.g. 25 4-byte unicode characters = 100 bytes)
      const unicodePassword = '🚀'.repeat(20); // 80 bytes
      assert.throws(
        () => validatePasswordStrength(unicodePassword),
        /exceeds the maximum supported length of 72 bytes/
      );
    });
  });

  describe('Token Service (Cryptographic Randomness & SHA-256 Hashing)', () => {
    it('should generate cryptographically random 64-character hex verification tokens and hashes', () => {
      const token1 = generateVerificationToken();
      const token2 = generateVerificationToken();

      // Raw token must be 32 bytes = 64 hex characters
      assert.equal(token1.rawToken.length, 64);
      assert.equal(token2.rawToken.length, 64);
      assert.notEqual(token1.rawToken, token2.rawToken); // Unique

      // Hashed token must be SHA-256 = 64 hex characters
      assert.equal(token1.hashedToken.length, 64);
      assert.equal(token1.hashedToken, hashToken(token1.rawToken));
      assert.notEqual(token1.hashedToken, token1.rawToken);

      // Expiration time should be ~24 hours in the future
      const now = Date.now();
      assert.ok(token1.expiresAt.getTime() > now + 23 * 60 * 60 * 1000);
      assert.ok(token1.expiresAt.getTime() <= now + 25 * 60 * 60 * 1000);
    });

    it('should generate password reset tokens with 1-hour expiration', () => {
      const resetToken = generatePasswordResetToken();
      assert.equal(resetToken.rawToken.length, 64);
      assert.equal(resetToken.hashedToken, hashToken(resetToken.rawToken));

      const now = Date.now();
      assert.ok(resetToken.expiresAt.getTime() > now + 50 * 60 * 1000);
      assert.ok(resetToken.expiresAt.getTime() <= now + 65 * 60 * 1000);
    });
  });

  describe('Email Service (Mock & Dispatch Isolation)', () => {
    beforeEach(() => {
      emailService.setAdapter('mock');
      emailService.clearSentEmails();
    });

    it('should dispatch verification email and store message in mock queue for test assertion', async () => {
      await emailService.sendVerificationEmail({
        to: 'student@capstone.edu',
        token: 'mock-verification-token-12345',
        name: 'Jane Contributor',
      });

      const sent = emailService.getSentEmails();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'student@capstone.edu');
      assert.equal(sent[0].type, 'VERIFICATION');
      assert.match(sent[0].verificationUrl, /verify-email\?token=mock-verification-token-12345/);
    });

    it('should dispatch password reset email without exposing secrets', async () => {
      await emailService.sendPasswordResetEmail({
        to: 'student@capstone.edu',
        token: 'mock-reset-token-67890',
        name: 'Jane Contributor',
      });

      const sent = emailService.getSentEmails();
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'student@capstone.edu');
      assert.equal(sent[0].type, 'PASSWORD_RESET');
      assert.match(sent[0].resetUrl, /reset-password\?token=mock-reset-token-67890/);
    });
  });
});
