import mongoose from 'mongoose';
import { Chunk } from '../models/Chunk.js';
import { Document } from '../models/Document.js';
import { env } from '../config/env.js';
import { validateEmbedding } from './embedding.service.js';
import { ApiError } from '../utils/errors.js';

/**
 * Calculates mathematical cosine similarity between two vectors.
 * Used for deterministic in-memory ranking during testing or local development.
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic Retrieval Service using MongoDB Atlas Vector Search ($vectorSearch).
 * 
 * SECURITY MANDATE:
 * - Scoped strictly to target project and snapshot. Never returns cross-project documents.
 * - Enforces private-document isolation: chunks from private documents are filtered out
 *   unless the requester has verified maintainer authority.
 * 
 * @param {Object} params
 * @param {string} params.projectId - Target project ObjectId
 * @param {string} [params.snapshotId] - Target snapshot ObjectId
 * @param {Array<number>} params.queryVector - 768-dimensional float embedding of the question
 * @param {number} [params.limit=5] - Maximum candidate chunks to retrieve
 * @param {boolean} [params.includePrivate=false] - Whether requester is authorized to view private docs
 * @returns {Promise<Array<Object>>} Ranked chunks with similarity score and metadata
 */
export async function searchSimilarChunks({
  projectId,
  snapshotId,
  queryVector,
  limit = 5,
  includePrivate = false,
}) {
  if (!projectId) {
    throw new ApiError(400, 'MISSING_PROJECT_ID', 'Project ID is required for vector search.');
  }

  // Strictly validate query vector dimensionality and numeric validity
  validateEmbedding(queryVector);

  const parsedProjectId = new mongoose.Types.ObjectId(projectId);
  const parsedSnapshotId = snapshotId ? new mongoose.Types.ObjectId(snapshotId) : null;

  // 1. Determine permitted document IDs (Private Document Isolation)
  // If user is not authorized for private content, restrict search to public documents only
  let permittedDocFilter = { projectId: parsedProjectId };
  if (!includePrivate) {
    permittedDocFilter.visibility = 'public';
  }
  if (parsedSnapshotId) {
    permittedDocFilter.snapshotId = parsedSnapshotId;
  }

  const permittedDocIds = await Document.find(permittedDocFilter).distinct('_id');
  if (permittedDocIds.length === 0) {
    return [];
  }

  // 2. Build Atlas Vector Search Aggregation Pipeline
  const indexName = env.ATLAS_VECTOR_INDEX_NAME || 'vector_index';

  const vectorSearchStage = {
    $vectorSearch: {
      index: indexName,
      path: 'embedding',
      queryVector,
      numCandidates: Math.max(limit * 10, 50),
      limit,
      filter: {
        projectId: parsedProjectId,
        ...(parsedSnapshotId ? { snapshotId: parsedSnapshotId } : {}),
      },
    },
  };

  const pipeline = [
    vectorSearchStage,
    // Ensure only chunks from permitted documents are returned (Private Document Isolation)
    {
      $match: {
        documentId: { $in: permittedDocIds },
      },
    },
    {
      $project: {
        _id: 1,
        projectId: 1,
        snapshotId: 1,
        documentId: 1,
        chunkIndex: 1,
        text: 1,
        metadata: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  try {
    const results = await Chunk.aggregate(pipeline);
    return results;
  } catch (error) {
    // If the live Atlas Vector Search index is not yet built, or in standalone local testing:
    // Fall back to exact in-memory cosine similarity over permitted chunks in the target project/snapshot
    const isAtlasIndexUnavailable =
      error.code === 40324 || // Unrecognized pipeline stage $vectorSearch (e.g. local standalone MongoDB)
      error.message?.includes('vectorSearch') ||
      error.message?.includes('index') ||
      error.message?.includes('Index not found');

    if (isAtlasIndexUnavailable) {
      const candidateChunks = await Chunk.find({
        projectId: parsedProjectId,
        ...(parsedSnapshotId ? { snapshotId: parsedSnapshotId } : {}),
        documentId: { $in: permittedDocIds },
        embedding: { $exists: true, $ne: [] },
      })
        .select('_id projectId snapshotId documentId chunkIndex text embedding metadata')
        .lean();

      const scored = candidateChunks
        .map((chunk) => {
          const score = cosineSimilarity(queryVector, chunk.embedding);
          const { embedding, ...safeChunk } = chunk;
          return {
            ...safeChunk,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    }

    throw new ApiError(500, 'VECTOR_SEARCH_ERROR', `Vector search failed: ${error.message}`);
  }
}
