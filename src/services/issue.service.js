import mongoose from 'mongoose';
import { Issue } from '../models/Issue.js';
import { Project } from '../models/Project.js';
import { Interest } from '../models/Interest.js';
import { isUserProjectMaintainer } from './project.service.js';
import { generateEmbedding, validateEmbedding } from './embedding.service.js';
import { cosineSimilarity } from './vector-search.service.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * Contributor Issue Interest Submission Service
 * Allows a verified contributor to declare interest and availability on an open issue.
 *
 * SECURITY:
 * - Contributor ID is derived securely from the authenticated session.
 * - Issue must belong to an approved, public project.
 * - Issue must be open (cannot express interest in taken/closed issues).
 * - Enforces unique active interest per contributor and issue.
 * - Does NOT automatically assign the issue or alter its status.
 */
export async function submitIssueInterest(issueId, contributorUserId, { declaredAvailableHours, message }) {
  const issue = await Issue.findById(issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }

  // Confirm project is approved and publicly accessible
  const project = await Project.findById(issue.projectId).select('approvalStatus visibility').lean();
  if (!project || project.approvalStatus !== 'approved' || project.visibility !== 'public') {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found or belongs to an unapproved/private project.');
  }

  // Enforce issue availability
  if (issue.status !== 'open') {
    throw new ApiError(
      400,
      'ISSUE_NOT_AVAILABLE',
      `Issue is not available for interest expressions (current status is "${issue.status}").`
    );
  }

  // Check for existing active interest from this contributor
  const existingActive = await Interest.findOne({
    issueId: issue._id,
    contributorId: contributorUserId,
    status: 'active',
  });

  if (existingActive) {
    throw new ApiError(
      409,
      'INTEREST_ALREADY_EXISTS',
      'You have already expressed active interest in this issue.'
    );
  }

  try {
    const interest = await Interest.create({
      issueId: issue._id,
      contributorId: contributorUserId,
      declaredAvailableHours,
      message: message || '',
      status: 'active',
    });

    return interest;
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(
        409,
        'INTEREST_ALREADY_EXISTS',
        'You have already expressed active interest in this issue.'
      );
    }
    throw err;
  }
}

/**
 * Maintainer Issue Management Service
 * Allows authorized project maintainers to update issue status, setup steps, or metadata.
 *
 * SECURITY:
 * - Requires project-scoped maintainer privileges or project ownership.
 * - Restricts modification strictly to approved mutable fields.
 * - Protects projectId, snapshotId, and issueNumber from unauthorized mutation.
 */
export async function updateIssue(issueId, maintainerUserId, updateData) {
  const issue = await Issue.findById(issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }

  // Enforce project-scoped maintainer authorization
  const isAuthorized = await isUserProjectMaintainer(issue.projectId, maintainerUserId);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      'FORBIDDEN_NOT_MAINTAINER',
      'You do not have maintainer privileges for this specific project.'
    );
  }

  // Apply only explicitly allowed fields
  const allowedFields = [
    'title',
    'description',
    'status',
    'requiredSkills',
    'prerequisites',
    'setupSteps',
    'contributionRequirements',
    'labels',
    'estimatedEffort',
    'isStaleSetup',
    'staleSetupNotes',
    'assignedContributorId',
  ];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      issue[field] = updateData[field];
    }
  }

  await issue.save();
  return issue;
}

/**
 * Constructs a composite text string representing an issue for semantic embedding generation.
 * Combines title, description, required skills, labels, prerequisites, and estimated effort.
 *
 * @param {Object} issue
 * @returns {string}
 */
export function generateIssueEmbeddingText(issue) {
  if (!issue) return '';
  const parts = [
    `Issue Title: ${issue.title || ''}`,
    `Description: ${issue.description || ''}`,
  ];
  if (issue.requiredSkills && issue.requiredSkills.length > 0) {
    parts.push(`Required Skills: ${issue.requiredSkills.join(', ')}`);
  }
  if (issue.labels && issue.labels.length > 0) {
    parts.push(`Labels: ${issue.labels.join(', ')}`);
  }
  if (issue.prerequisites && issue.prerequisites.length > 0) {
    parts.push(`Prerequisites: ${issue.prerequisites.join('. ')}`);
  }
  if (issue.estimatedEffort) {
    parts.push(`Estimated Effort: ${issue.estimatedEffort}`);
  }
  return parts.join('\n');
}

/**
 * Generates and saves a 768-dimensional embedding for an issue.
 *
 * @param {string} issueId
 * @returns {Promise<Object>} Updated issue
 */
export async function indexIssueEmbedding(issueId) {
  const issue = await Issue.findById(issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }

  const text = generateIssueEmbeddingText(issue);
  const embedding = await generateEmbedding(text);
  validateEmbedding(embedding, env.EMBEDDING_DIMENSIONS || 768);

  issue.embedding = embedding;
  await issue.save();
  return issue;
}

/**
 * Performs semantic vector search over the issues collection.
 * Uses Atlas Vector Search ($vectorSearch stage on 'issues' collection),
 * with pre-filtering by status and optional projectId.
 * Falls back to exact in-memory cosine similarity if Atlas search is unavailable.
 *
 * @param {Object} params
 * @param {string} [params.projectId]
 * @param {Array<number>} params.queryVector
 * @param {number} [params.limit=5]
 * @param {string} [params.status='open']
 * @returns {Promise<Array<Object>>} Ranked issues with score and matchingMethod
 */
export async function searchSimilarIssues({ projectId, queryVector, limit = 5, status = 'open' }) {
  validateEmbedding(queryVector, env.EMBEDDING_DIMENSIONS || 768);

  const filter = { status };
  if (projectId) {
    filter.projectId = new mongoose.Types.ObjectId(projectId);
  }

  const pipeline = [
    {
      $vectorSearch: {
        index: env.ATLAS_ISSUE_VECTOR_INDEX_NAME || 'issue_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: Math.max(limit * 10, 50),
        limit,
        filter,
      },
    },
    {
      $project: {
        _id: 1,
        projectId: 1,
        snapshotId: 1,
        issueNumber: 1,
        title: 1,
        description: 1,
        requiredSkills: 1,
        prerequisites: 1,
        setupSteps: 1,
        estimatedEffort: 1,
        status: 1,
        labels: 1,
        sourceEvidence: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  try {
    const results = await Issue.aggregate(pipeline);
    return results.map((r) => ({ ...r, matchingMethod: 'semantic_vector_search' }));
  } catch (error) {
    const isAtlasUnavailable =
      error.code === 40324 ||
      error.message?.includes('vectorSearch') ||
      error.message?.includes('index') ||
      error.message?.includes('Index not found');

    if (isAtlasUnavailable) {
      // In-memory cosine similarity fallback over matching issues with embeddings
      const candidateIssues = await Issue.find({
        ...filter,
        embedding: { $exists: true, $ne: [] },
      })
        .select('_id projectId snapshotId issueNumber title description requiredSkills prerequisites setupSteps estimatedEffort status labels sourceEvidence embedding')
        .lean();

      if (candidateIssues.length === 0) {
        return [];
      }

      const scored = candidateIssues
        .map((iss) => {
          const score = cosineSimilarity(queryVector, iss.embedding);
          const { embedding, ...safeIssue } = iss;
          return {
            ...safeIssue,
            score,
            matchingMethod: 'semantic_vector_search_fallback',
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    }

    throw error;
  }
}
