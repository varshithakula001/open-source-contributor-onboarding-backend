import crypto from 'node:crypto';

const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;          // 1 hour

/**
 * Computes a secure SHA-256 hash of a raw token.
 * Tokens are never stored in plaintext in the database.
 */
export function hashToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new Error('Cannot hash an invalid or empty token.');
  }
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure random token and its corresponding SHA-256 hash
 * for email verification.
 */
export function generateVerificationToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);

  return { rawToken, hashedToken, expiresAt };
}

/**
 * Generates a cryptographically secure random token and its corresponding SHA-256 hash
 * for password reset.
 */
export function generatePasswordResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  return { rawToken, hashedToken, expiresAt };
}
