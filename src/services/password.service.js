import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// Maximum byte length supported by the bcrypt algorithm before truncation occurs
const BCRYPT_MAX_BYTES = 72;

/**
 * Validates password length and byte length.
 * Ensures passwords are at least 8 characters and do not exceed bcrypt's 72-byte limit.
 */
export function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string.');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > BCRYPT_MAX_BYTES) {
    throw new Error(
      `Password exceeds the maximum supported length of ${BCRYPT_MAX_BYTES} bytes. Please choose a shorter password.`
    );
  }

  return true;
}

/**
 * Asynchronously hashes a password using bcryptjs.
 */
export async function hashPassword(password) {
  validatePasswordStrength(password);
  const saltRounds = env.BCRYPT_SALT_ROUNDS || 12;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Asynchronously compares a candidate plaintext password with a bcrypt hash.
 */
export async function comparePassword(candidatePassword, hash) {
  if (typeof candidatePassword !== 'string' || !hash) {
    return false;
  }

  // Prevent bcrypt error if candidate exceeds max bytes
  if (Buffer.byteLength(candidatePassword, 'utf8') > BCRYPT_MAX_BYTES) {
    return false;
  }

  return await bcrypt.compare(candidatePassword, hash);
}
