import mongoose from 'mongoose';

/**
 * Project Schema
 * Represents open-source projects registered on the platform.
 * Keeps visibility ('public' vs 'private') separate from approvalStatus ('pending', 'approved', 'rejected').
 */
const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Project slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Project slug must be URL-safe (lowercase letters, numbers, and hyphens)',
      ],
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Project description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    repositoryUrl: {
      type: String,
      required: [true, 'Repository URL is required'],
      trim: true,
      match: [
        /^https?:\/\/([\w.-]+)+[\w.-]+(\/[\w\-./?%&=]*)?$/,
        'Please provide a valid repository URL (must start with http:// or https://)',
      ],
    },
    visibility: {
      type: String,
      enum: {
        values: ['public', 'private'],
        message: '{VALUE} is not a valid visibility setting. Must be "public" or "private".',
      },
      default: 'public',
      required: true,
    },
    approvalStatus: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'],
        message: '{VALUE} is not a valid approval status. Must be "pending", "approved", or "rejected".',
      },
      default: 'pending',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project owner reference is required'],
      index: true,
    },
    topics: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    languages: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: [],
    },
    approvalInfo: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedAt: {
        type: Date,
      },
      rejectionReason: {
        type: String,
        trim: true,
        maxlength: [1000, 'Rejection reason cannot exceed 1000 characters'],
      },
    },
    currentSnapshotVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to support fast discovery queries filtering approved public projects (GET /api/projects)
projectSchema.index({ approvalStatus: 1, visibility: 1 });

export const Project = mongoose.model('Project', projectSchema);
export default Project;
