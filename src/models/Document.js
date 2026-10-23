import mongoose from 'mongoose';

/**
 * Document Schema
 * Represents raw documentation files (e.g., README.md, CONTRIBUTING.md, SETUP.md) within a snapshot.
 * 
 * SECURITY NOTICE: Content stored in this model represents UNTRUSTED third-party repository data.
 * The backend must never execute, interpret, or grant permissions based on markdown instructions.
 */
const documentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required for a document'],
      index: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snapshot',
      required: [true, 'Snapshot reference is required for a document'],
      index: true,
    },
    filePath: {
      type: String,
      required: [true, 'File path is required (e.g., docs/setup.md)'],
      trim: true,
      maxlength: [500, 'File path cannot exceed 500 characters'],
    },
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [200, 'Document title cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Document content is required'],
      // Raw content from imported repository files — treated as strictly untrusted text
    },
    docType: {
      type: String,
      enum: {
        values: ['guide', 'setup', 'architecture', 'readme', 'other'],
        message: '{VALUE} is not a valid docType. Allowed: guide, setup, architecture, readme, other.',
      },
      default: 'other',
      required: true,
    },
    contentHash: {
      type: String,
      trim: true,
    },
    visibility: {
      type: String,
      enum: {
        values: ['public', 'private'],
        message: '{VALUE} is not a valid visibility. Must be "public" or "private".',
      },
      default: 'public',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique filePath within a given snapshot
documentSchema.index({ snapshotId: 1, filePath: 1 }, { unique: true });

// Support searching documents within a project by type and visibility
documentSchema.index({ projectId: 1, docType: 1, visibility: 1 });

export const Document = mongoose.model('Document', documentSchema);
export default Document;
