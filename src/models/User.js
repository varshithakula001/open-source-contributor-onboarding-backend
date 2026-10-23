import mongoose from 'mongoose';

/**
 * User Schema
 * Represents platform contributors, project maintainers, and platform moderators.
 * Includes security fields for hashed verification/reset tokens and profile information.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Excluded from default query results for safety
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Hashed tokens for future Phase 3 verification flows
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['contributor', 'maintainer', 'moderator'],
        message: '{VALUE} is not a supported role. Valid roles: contributor, maintainer, moderator.',
      },
      default: 'contributor', // New registrations always default to contributor
      required: true,
    },
    profile: {
      displayName: {
        type: String,
        trim: true,
        default: '',
        maxlength: [100, 'Display name cannot exceed 100 characters'],
      },
      skills: {
        type: [{ type: String, trim: true, lowercase: true }],
        default: [],
      },
      interests: {
        type: [{ type: String, trim: true }],
        default: [],
      },
      experienceLevel: {
        type: String,
        enum: {
          values: ['beginner', 'intermediate', 'advanced'],
          message: '{VALUE} is not a valid experience level.',
        },
        default: 'beginner',
      },
      availableHoursPerWeek: {
        type: Number,
        min: [0, 'Available hours cannot be negative'],
        max: [168, 'Available hours cannot exceed 168 hours per week'],
        default: 5,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Session version counter for invalidating all active sessions on password reset
    sessionVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Method to return a safe user object representation without sensitive fields
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.emailVerificationTokenHash;
  delete obj.emailVerificationExpiresAt;
  delete obj.passwordResetTokenHash;
  delete obj.passwordResetExpiresAt;
  delete obj.sessionVersion;
  return obj;
};

export const User = mongoose.model('User', userSchema);
export default User;
