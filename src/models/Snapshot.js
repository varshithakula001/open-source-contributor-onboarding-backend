import mongoose from 'mongoose';

/**
 * Snapshot Schema
 * Represents a versioned snapshot of imported repository documentation.
 * Allows repository RAG and onboarding to operate deterministically on vetted snapshot versions.
 */
const snapshotSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required for a snapshot'],
      index: true,
    },
    version: {
      type: String,
      required: [true, 'Version identifier is required (e.g., v1.0.0)'],
      trim: true,
      maxlength: [50, 'Version string cannot exceed 50 characters'],
    },
    importStatus: {
      type: String,
      enum: {
        values: ['importing', 'imported', 'failed'],
        message: '{VALUE} is not a valid import status. Must be "importing", "imported", or "failed".',
      },
      default: 'importing',
      required: true,
    },
    importSource: {
      type: String,
      required: [true, 'Import source is required (e.g., commit hash, release tag, archive)'],
      trim: true,
      maxlength: [200, 'Import source cannot exceed 200 characters'],
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Importing maintainer reference is required'],
    },
    contentDigest: {
      type: String,
      trim: true,
    },
    isStale: {
      type: Boolean,
      default: false,
    },
    staleReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Stale reason cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique version per project
snapshotSchema.index({ projectId: 1, version: 1 }, { unique: true });

// Support fast lookup of non-stale imported snapshots
snapshotSchema.index({ projectId: 1, isStale: 1, importStatus: 1 });

export const Snapshot = mongoose.model('Snapshot', snapshotSchema);
export default Snapshot;
