import mongoose from 'mongoose';

/**
 * MaintainerGrant Schema
 * Represents project-scoped maintainer privileges granted to a user by a moderator/owner.
 * Ensures maintainers are strictly scoped to specific projects rather than possessing global platform rights.
 */
const maintainerGrantSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required for a maintainer grant'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for a maintainer grant'],
      index: true,
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Granting user reference is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'revoked'],
        message: '{VALUE} is not a valid grant status. Must be "active" or "revoked".',
      },
      default: 'active',
      required: true,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Enforce uniqueness so a user cannot have duplicate grant records for the same project
maintainerGrantSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Index for quickly looking up active maintainers of a project
maintainerGrantSchema.index({ projectId: 1, status: 1 });

export const MaintainerGrant = mongoose.model('MaintainerGrant', maintainerGrantSchema);
export default MaintainerGrant;
