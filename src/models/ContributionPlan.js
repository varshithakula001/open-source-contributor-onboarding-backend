import mongoose from 'mongoose';

/**
 * ContributionPlan Schema
 * Represents a contributor's proposed implementation plan for an issue.
 * Contains ordered implementation steps and citations referencing repository snapshot evidence.
 * Must be reviewed and approved by a maintainer before code contributions proceed.
 */
const contributionPlanSchema = new mongoose.Schema(
  {
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Contributor reference is required'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required'],
      index: true,
    },
    issueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Issue',
      required: [true, 'Issue reference is required'],
      index: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snapshot',
      required: [true, 'Snapshot reference is required to ground plan evidence'],
    },
    planObjective: {
      type: String,
      required: [true, 'Plan objective is required'],
      trim: true,
      maxlength: [500, 'Objective cannot exceed 500 characters'],
    },
    proposedApproach: {
      type: String,
      required: [true, 'Proposed approach is required'],
      trim: true,
    },
    orderedImplementationSteps: {
      type: [
        {
          stepNumber: {
            type: Number,
            required: [true, 'Step number is required'],
            min: [1, 'Step number must be >= 1'],
          },
          description: {
            type: String,
            required: [true, 'Step description is required'],
            trim: true,
          },
          targetFiles: {
            type: [{ type: String, trim: true }],
            default: [],
          },
        },
      ],
      validate: {
        validator: function (steps) {
          return Array.isArray(steps) && steps.length > 0;
        },
        message: 'Contribution plan must have at least one implementation step.',
      },
    },
    supportingEvidence: {
      type: [
        {
          snapshotVersion: {
            type: String,
            required: [true, 'Evidence must cite a snapshot version'],
            trim: true,
          },
          filePath: {
            type: String,
            required: [true, 'Evidence must cite a repository file path'],
            trim: true,
          },
          chunkId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chunk',
          },
          quoteOrExplanation: {
            type: String,
            trim: true,
          },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected'],
        message: '{VALUE} is not a valid plan status. Valid statuses: draft, submitted, in_review, changes_requested, approved, rejected.',
      },
      default: 'draft', // Plans NEVER start approved
      required: true,
    },
    prerequisitesChecked: {
      type: Boolean,
      default: false,
    },
    submittedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for querying plans by contributor or maintainer inbox
contributionPlanSchema.index({ contributorId: 1, status: 1 });
contributionPlanSchema.index({ projectId: 1, status: 1 });

export const ContributionPlan = mongoose.model('ContributionPlan', contributionPlanSchema);
export default ContributionPlan;
