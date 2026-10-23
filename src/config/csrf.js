import { csrfSync } from 'csrf-sync';

/**
 * CSRF Protection Configuration using csrf-sync.
 * Synchronizer token pattern integrated with server-side express-session.
 * Clients obtain a token via GET /api/auth/csrf and send it in the 'X-CSRF-Token' header.
 */
export const {
  invalidCsrfTokenError,
  generateToken,
  csrfSynchronisedProtection,
  revokeToken,
  getTokenFromRequest,
  isRequestValid,
} = csrfSync({
  getTokenFromRequest: (req) =>
    req.headers['x-csrf-token'] || req.headers['csrf-token'],
});
