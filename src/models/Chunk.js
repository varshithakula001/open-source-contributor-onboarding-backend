import mongoose from 'mongoose';

/**
 * Chunk Schema
 * Represents granular segments of documentation files prepared for vector search and RAG.
 * 
 * VECTOR SEARCH INTEGRATION (Phase 5):
 * - Target Embedding Model: 'nomic-embed-text' via local Ollama.
 * - Dimensionality: 768 floats.
 * - Atlas Vector Search Index: 'vector_index' configured on field 'embedding'.
 */
const chunkSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project reference is required for a chunk'],
      index: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Snapshot',
      required: [true, 'Snapshot reference is required for a chunk'],
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Document reference is required for a chunk'],
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: [true, 'Chunk index is required'],
      min: [0, 'Chunk index cannot be negative'],
    },
    text: {
      type: String,
      required: [true, 'Chunk text content is required'],
    },
    embedding: {
      type: [Number],
      validate: {
        validator: function (val) {
          // If unpopulated (e.g. prior to embedding pipeline run), accept empty/undefined
          if (val === undefined || val === null || val.length === 0) {
            return true;
          }
          // The planned nomic-embed-text model generates exactly 768 dimensions
          return Array.isArray(val) && val.length === 768 && val.every((n) => typeof n === 'number' && !isNaN(n));
        },
        message: 'Embedding vector must have exactly 768 numeric dimensions (nomic-embed-text).',
      },
      // Note: In Atlas, an Atlas Search / Vector Search Index will target this field
    },
    metadata: {
      filePath: {
        type: String,
        trim: true,
      },
      snapshotVersion: {
        type: String,
        trim: true,
      },
      sectionTitle: {
        type: String,
        trim: true,
      },
      startLine: {
        type: Number,
      },
      endLine: {
        type: Number,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique chunk sequence number per document
chunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

// Support fast query and cleanup of chunks by snapshot or project
chunkSchema.index({ snapshotId: 1, chunkIndex: 1 });
chunkSchema.index({ projectId: 1, snapshotId: 1 });

export const Chunk = mongoose.model('Chunk', chunkSchema);
export default Chunk;
