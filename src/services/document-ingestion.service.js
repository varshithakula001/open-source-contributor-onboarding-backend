import { Snapshot } from '../models/Snapshot.js';
import { Document } from '../models/Document.js';
import { Chunk } from '../models/Chunk.js';
import { chunkMarkdownDocument } from './chunking.service.js';
import { generateChunkEmbeddings } from './embedding.service.js';
import { ApiError } from '../utils/errors.js';

/**
 * Document Ingestion & RAG Indexing Service
 * Converts snapshot repository documents into chunks and generates 768-dimensional embeddings.
 * 
 * IDEMPOTENCY & SAFETY:
 * - Running multiple times on the same snapshot safely replaces prior chunks without duplicates.
 * - If embedding generation fails, marks snapshot indexingStatus = 'failed' without corrupting documents or issues.
 * - Does NOT execute code or shell commands from markdown.
 * 
 * @param {string} snapshotId - Snapshot ObjectId to index
 * @param {Object} [options]
 * @param {number} [options.maxChunkSize=800]
 * @param {number} [options.overlap=150]
 * @returns {Promise<Object>} Ingestion summary with counts
 */
export async function indexSnapshotDocuments(snapshotId, options = {}) {
  const snapshot = await Snapshot.findById(snapshotId);
  if (!snapshot) {
    throw new ApiError(404, 'SNAPSHOT_NOT_FOUND', 'Target snapshot not found.');
  }

  // Retrieve all documentation files associated with this snapshot
  const documents = await Document.find({ snapshotId: snapshot._id });
  if (documents.length === 0) {
    snapshot.indexingStatus = 'indexed';
    snapshot.chunksCount = 0;
    snapshot.indexedAt = new Date();
    snapshot.indexingError = undefined;
    await snapshot.save();

    return {
      snapshotId: snapshot._id,
      version: snapshot.version,
      documentsCount: 0,
      chunksCount: 0,
      status: 'indexed',
    };
  }

  // Set snapshot indexingStatus to 'indexing'
  snapshot.indexingStatus = 'indexing';
  await snapshot.save();

  try {
    // 1. Chunk all documents
    const allChunks = [];
    for (const doc of documents) {
      const docChunks = chunkMarkdownDocument(doc, {
        maxChunkSize: options.maxChunkSize || 800,
        overlap: options.overlap !== undefined ? options.overlap : 150,
        snapshotVersion: snapshot.version,
      });
      allChunks.push(...docChunks);
    }

    if (allChunks.length === 0) {
      snapshot.indexingStatus = 'indexed';
      snapshot.chunksCount = 0;
      snapshot.indexedAt = new Date();
      await snapshot.save();

      return {
        snapshotId: snapshot._id,
        version: snapshot.version,
        documentsCount: documents.length,
        chunksCount: 0,
        status: 'indexed',
      };
    }

    // 2. Generate 768-dimensional embeddings for all chunks via Ollama
    await generateChunkEmbeddings(allChunks, 10);

    // 3. Idempotent storage: Remove old chunks for this snapshot before inserting fresh chunks
    await Chunk.deleteMany({ snapshotId: snapshot._id });

    // 4. Batch insert embedded chunks into MongoDB
    await Chunk.insertMany(allChunks);

    // 5. Update Snapshot record as RAG-ready ('indexed')
    snapshot.indexingStatus = 'indexed';
    snapshot.chunksCount = allChunks.length;
    snapshot.indexedAt = new Date();
    snapshot.indexingError = undefined;
    await snapshot.save();

    return {
      snapshotId: snapshot._id,
      version: snapshot.version,
      documentsCount: documents.length,
      chunksCount: allChunks.length,
      status: 'indexed',
    };
  } catch (error) {
    // Record explicit failure state so RAG queries know this snapshot is unavailable
    snapshot.indexingStatus = 'failed';
    snapshot.indexingError = error.message;
    await snapshot.save();

    throw error;
  }
}
