import mongoose from 'mongoose';

/**
 * Interest Schema
 * Records a contributor expressing interest in working on a specific issue.
 * Tracks available time commitment and current interest status.
 */
const interestSchema = new mongoose.Schema(
  {
    issueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      required: [true, 'Issue reference is required'],
      index: true,
    },
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Contributor reference is required'],
      index: true,
    },
    declaredAvailableHours: {
      type: Number,
      required: [true, 'Declared available hours are required'],
      min: [1, 'Must declare at least 1 available hour'],
      max: [168, 'Available hours cannot exceed 168 hours in a week'],
    },
    message: {
      type: String,
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'withdrawn'],
        message: '{VALUE} is not a valid status. Must be "active" or "withdrawn".',
      },
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate ACTIVE interest submissions for the same contributor on the same issue
interestSchema.index(
  { issueId: 1, contributorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
  }
);

export const Interest = mongoose.model('Interest', interestSchema);
export default Interest;
