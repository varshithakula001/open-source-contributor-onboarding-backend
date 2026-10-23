import mongoose from 'mongoose';

/**
 * Review Schema
 * Records project maintainer feedback and formal decisions on contributor plans.
 * 
 * ROLE BOUNDARY NOTICE:
 * Reviews may only be submitted by verified maintainers of the target project.
 * Platform moderators cannot approve code contribution plans unless they hold a MaintainerGrant.
 */
const reviewSchema = new mongoose.Schema(
  {
    contributionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContributionPlan',
      required: [true, 'Contribution plan reference is required'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required'],
      index: true,
    },
    reviewingMaintainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reviewing maintainer reference is required'],
      index: true,
    },
    decision: {
      type: String,
      enum: {
        values: ['approved', 'request_changes', 'rejected'],
        message: '{VALUE} is not a valid review decision. Valid decisions: approved, request_changes, rejected.',
      },
      required: [true, 'Review decision is required'],
    },
    feedback: {
      type: String,
      required: [true, 'Review feedback is required'],
      trim: true,
      minlength: [10, 'Review feedback must be at least 10 characters long'],
      maxlength: [5000, 'Review feedback cannot exceed 5000 characters'],
    },
    reviewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Support fast retrieval of all reviews for a specific contribution plan
reviewSchema.index({ contributionPlanId: 1, reviewedAt: -1 });

export const Review = mongoose.model('Review', reviewSchema);
export default Review;
