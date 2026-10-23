import { User } from '../models/User.js';

/**
 * Authentication Middleware: requireAuth
 * Ensures that a request possesses a valid, active, verified server-side session.
 */
export async function requireAuth(req, res, next) {
  try {
    // 1. Verify session presence and authenticated user identifier
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please log in.',
        },
      });
    }

    // 2. Fetch fresh user state from the database
    const user = await User.findById(req.session.userId);
    if (!user) {
      // User account was deleted or ID in session is no longer valid
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User account not found. Please log in again.',
        },
      });
    }

    // 3. Confirm account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'This account has been deactivated.',
        },
      });
    }

    // 4. Enforce email verification
    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Email verification is required before accessing this protected resource.',
        },
      });
    }

    // 5. Check session version to support revocation across all active sessions
    if (
      req.session.sessionVersion !== undefined &&
      user.sessionVersion !== undefined &&
      req.session.sessionVersion !== user.sessionVersion
    ) {
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Your session has been invalidated due to a security update or password change. Please log in again.',
        },
      });
    }

    // 6. Attach safe user object to request
    req.user = user.toSafeObject();
    next();
  } catch (error) {
    next(error);
  }
}
