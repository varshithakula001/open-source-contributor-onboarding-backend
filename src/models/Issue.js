import mongoose from 'mongoose';

/**
 * Issue Schema
 * Represents curated open-source tasks/issues available for contributor onboarding.
 * Carries prerequisites, setup instructions, skills, and availability status.
 */
const issueSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required for an issue'],
      index: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snapshot',
      index: true,
    },
    issueNumber: {
      type: Number,
      required: [true, 'Issue number is required'],
      min: [1, 'Issue number must be a positive integer'],
    },
    issueSlug: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Issue title is required'],
      trim: true,
      maxlength: [200, 'Issue title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Issue description is required'],
      trim: true,
    },
    requiredSkills: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    prerequisites: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    setupSteps: {
      type: [{ type: String, trim: true }],
      default: [],
    },
    contributionRequirements: {
      type: String,
      trim: true,
    },
    labels: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    estimatedEffort: {
      type: String,
      enum: {
        values: ['hours', 'weekend', 'few_days', 'week_plus'],
        message: '{VALUE} is not a valid estimated effort.',
      },
      default: 'weekend',
    },
    status: {
      type: String,
      enum: {
        values: ['open', 'taken', 'closed'],
        message: '{VALUE} is not a valid issue status. Valid statuses: "open", "taken", "closed".',
      },
      default: 'open',
      required: true,
    },
    embedding: {
      type: [Number],
      default: undefined,
      validate: {
        validator: function (v) {
          if (!v || v.length === 0) return true;
          return v.length === 768 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
        },
        message: 'Issue embedding vector must contain exactly 768 numeric dimensions.',
      },
    },
    assignedContributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    isStaleSetup: {
      type: Boolean,
      default: false,
    },
    staleSetupNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    sourceEvidence: {
      snapshotVersion: {
        type: String,
        trim: true,
      },
      filePaths: {
        type: [{ type: String, trim: true }],
        default: [],
      },
      notes: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique issue number per project
issueSchema.index({ projectId: 1, issueNumber: 1 }, { unique: true });

// Support fast querying of open issues within a project
issueSchema.index({ projectId: 1, status: 1 });

export const Issue = mongoose.model('Issue', issueSchema);
export default Issue;
