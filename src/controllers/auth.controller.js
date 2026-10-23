import { User } from '../models/User.js';
import { hashPassword, comparePassword, validatePasswordStrength } from '../services/password.service.js';
import { generateVerificationToken, generatePasswordResetToken, hashToken } from '../services/token.service.js';
import { emailService } from '../services/email.service.js';
import { generateToken } from '../config/csrf.js';

export const authController = {
  /**
   * POST /api/auth/signup
   * Registers a new contributor account.
   */
  async signup(req, res, next) {
    try {
      const { email, password, profile } = req.body;

      // Validate bcrypt input length limit (72 bytes)
      validatePasswordStrength(password);

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'An account with this email address already exists.',
          },
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Generate cryptographically random email verification token
      const { rawToken, hashedToken, expiresAt } = generateVerificationToken();

      // Create new user strictly defaulting to 'contributor'
      const newUser = new User({
        email: normalizedEmail,
        passwordHash,
        role: 'contributor',
        emailVerified: false,
        emailVerificationTokenHash: hashedToken,
        emailVerificationExpiresAt: expiresAt,
        profile: profile || {},
        sessionVersion: 1,
      });

      await newUser.save();

      // Dispatch verification message via email service
      await emailService.sendVerificationEmail({
        to: newUser.email,
        token: rawToken,
        name: newUser.profile?.displayName || 'Contributor',
      });

      // Never return verification token in API response
      return res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: {
          user: newUser.toSafeObject(),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/verify-email
   * Confirms user email using the verification token.
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;
      const hashedToken = hashToken(token);

      const user = await User.findOne({
        emailVerificationTokenHash: hashedToken,
        emailVerificationExpiresAt: { $gt: new Date() },
      }).select('+emailVerificationTokenHash +emailVerificationExpiresAt');

      if (!user) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OR_EXPIRED_TOKEN',
            message: 'Verification token is invalid, expired, or has already been used.',
          },
        });
      }

      user.emailVerified = true;
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpiresAt = undefined;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Email address verified successfully. You may now log in.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/login
   * Authenticates user, establishes server-side session, and issues CSRF token.
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
      if (!user || !user.passwordHash) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email address or password.',
          },
        });
      }

      const isMatch = await comparePassword(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email address or password.',
          },
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DEACTIVATED',
            message: 'This account has been deactivated. Please contact support.',
          },
        });
      }

      if (!user.emailVerified) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email address before logging in.',
          },
        });
      }

      // Regenerate session to eliminate session fixation vulnerability
      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.userId = user._id.toString();
        req.session.sessionVersion = user.sessionVersion || 1;

        // Generate a new CSRF token for this authenticated session
        const csrfToken = generateToken(req);

        req.session.save((saveErr) => {
          if (saveErr) return next(saveErr);

          return res.status(200).json({
            success: true,
            message: 'Login successful.',
            data: {
              user: user.toSafeObject(),
              csrfToken,
            },
          });
        });
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/logout
   * Destroys server-side session and clears cookie.
   */
  async logout(req, res, next) {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            return next(err);
          }
          res.clearCookie('osco.sid');
          return res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
          });
        });
      } else {
        res.clearCookie('osco.sid');
        return res.status(200).json({
          success: true,
          message: 'Logged out successfully.',
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/forgot-password
   * Dispatches password recovery email without disclosing account existence.
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ email: normalizedEmail });

      if (user && user.isActive) {
        const { rawToken, hashedToken, expiresAt } = generatePasswordResetToken();
        user.passwordResetTokenHash = hashedToken;
        user.passwordResetExpiresAt = expiresAt;
        await user.save();

        await emailService.sendPasswordResetEmail({
          to: user.email,
          token: rawToken,
          name: user.profile?.displayName || 'User',
        });
      }

      // Consistent generic message preventing email enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account matches that email address, a password recovery link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/reset-password
   * Resets password and revokes all existing sessions.
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;

      validatePasswordStrength(newPassword);

      const hashedToken = hashToken(token);

      const user = await User.findOne({
        passwordResetTokenHash: hashedToken,
        passwordResetExpiresAt: { $gt: new Date() },
      }).select('+passwordResetTokenHash +passwordResetExpiresAt +passwordHash');

      if (!user) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OR_EXPIRED_TOKEN',
            message: 'Password reset token is invalid, expired, or has already been used.',
          },
        });
      }

      const newPasswordHash = await hashPassword(newPassword);

      user.passwordHash = newPasswordHash;
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      // Increment sessionVersion to invalidate all existing server sessions across all devices
      user.sessionVersion = (user.sessionVersion || 1) + 1;

      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Password has been reset successfully. Please log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/auth/me
   * Returns authenticated user profile.
   */
  async me(req, res) {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  },

  /**
   * GET /api/auth/csrf
   * Issues a CSRF token associated with the current session.
   */
  async csrf(req, res) {
    const csrfToken = generateToken(req);
    return res.status(200).json({
      success: true,
      data: {
        csrfToken,
      },
    });
  },
};

export default authController;
