import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Issue } from '../../models/Issue.js';
import { Project } from '../../models/Project.js';
import { Snapshot } from '../../models/Snapshot.js';
import { Chunk } from '../../models/Chunk.js';
import { isUserProjectMaintainer } from '../../services/project.service.js';
import { ApiError } from '../../utils/errors.js';

/**
 * Zod Input Validation Schema for inspectPrerequisites tool.
 */
export const inspectPrerequisitesInputSchema = z.object({
  issueId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Issue ID format')
    .describe('24-character hexadecimal MongoDB ObjectId of the issue to inspect'),
});

/**
 * Inspects prerequisites, setup steps, and supporting repository documentation for an issue.
 *
 * SECURITY MANDATE:
 * - Enforces project-scoped authorization (rejects unauthorized access to private project issues).
 * - Never hallucinates or invents missing documentation. Explicitly reports unavailable information.
 *
 * @param {Object} input - Validated input { issueId }
 * @param {Object} context - Execution context { userId, userRole }
 * @returns {Promise<Object>} Structured prerequisite and setup intelligence
 */
export async function inspectPrerequisites(input, context = {}) {
  const parsedInput = inspectPrerequisitesInputSchema.parse(input || {});
  const { userId, userRole } = context;

  // 1. Retrieve target issue
  const issue = await Issue.findById(parsedInput.issueId).lean();
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }

  // 2. Retrieve associated project and enforce authorization
  const project = await Project.findById(issue.projectId).lean();
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project associated with this issue was not found.');
  }

  const isMaintainer = userId ? await isUserProjectMaintainer(project._id, userId) : false;
  const isModerator = userRole === 'moderator';

  if (project.approvalStatus !== 'approved' && !isMaintainer && !isModerator) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project is not approved.');
  }

  if (project.visibility === 'private' && !isMaintainer) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to private project issue prerequisites.');
  }

  // 3. Inspect Snapshot & Staleness
  let snapshot = null;
  if (issue.snapshotId) {
    snapshot = await Snapshot.findById(issue.snapshotId).lean();
  }
  if (!snapshot) {
    snapshot = await Snapshot.findOne({
      projectId: project._id,
      importStatus: 'imported',
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  const isStale = (snapshot?.isStale === true) || (issue.isStaleSetup === true);
  const staleWarning = isStale
    ? (issue.staleSetupNotes || snapshot?.staleReason || 'The documentation snapshot for this project is marked as stale. Setup commands or dependencies may differ from current repository code.')
    : null;

  const snapshotFreshnessStatus = snapshot
    ? (isStale ? 'stale' : 'current')
    : 'no_snapshot';

  // 4. Retrieve supporting documentation references from repository chunks
  const documentationReferences = [];
  const referencedFilePaths = issue.sourceEvidence?.filePaths || [];

  if (snapshot) {
    const chunkFilter = {
      projectId: project._id,
      snapshotId: snapshot._id,
    };

    if (referencedFilePaths.length > 0) {
      chunkFilter['metadata.filePath'] = { $in: referencedFilePaths };
    }

    const matchedChunks = await Chunk.find(chunkFilter)
      .select('text metadata')
      .limit(3)
      .lean();

    for (const chunk of matchedChunks) {
      documentationReferences.push({
        filePath: chunk.metadata?.filePath || 'Documentation',
        sectionTitle: chunk.metadata?.sectionTitle || 'Setup',
        snapshotVersion: chunk.metadata?.snapshotVersion || snapshot.version,
        startLine: chunk.metadata?.startLine,
        endLine: chunk.metadata?.endLine,
        excerpt: chunk.text.slice(0, 300) + (chunk.text.length > 300 ? '...' : ''),
      });
    }
  }

  // 5. Synthesize required background knowledge from skills and contribution requirements
  const requiredBackgroundKnowledge = (issue.requiredSkills || []).map((skill) => {
    return `Working knowledge of ${skill} and related ecosystem tooling.`;
  });

  if (issue.contributionRequirements) {
    requiredBackgroundKnowledge.push(`Familiarity with project rules: ${issue.contributionRequirements}`);
  }

  let missingInformationNotes = null;
  if (documentationReferences.length === 0 && (!issue.setupSteps || issue.setupSteps.length === 0)) {
    missingInformationNotes = 'Detailed repository setup documentation is not recorded for this issue. Contributor should inspect repository root guides or consult maintainers before commencing.';
  }

  return {
    issueId: issue._id.toString(),
    issueNumber: issue.issueNumber,
    projectId: project._id.toString(),
    projectName: project.name,
    title: issue.title,
    requiredSkills: issue.requiredSkills || [],
    requiredBackgroundKnowledge,
    setupPrerequisites: issue.prerequisites || [],
    setupSteps: issue.setupSteps || [],
    documentationReferences,
    snapshotVersion: snapshot?.version || 'v1.0.0',
    snapshotFreshnessStatus,
    staleWarning,
    missingInformationNotes,
  };
}

/**
 * LangChain DynamicStructuredTool export for inspectPrerequisites.
 */
export const inspectPrerequisitesTool = tool(
  async (input, config) => {
    const context = config?.configurable?.context || {};
    const results = await inspectPrerequisites(input, context);
    return JSON.stringify(results);
  },
  {
    name: 'inspectPrerequisites',
    description: 'Inspects prerequisites, setup steps, required skills, and supporting repository documentation for an issue.',
    schema: inspectPrerequisitesInputSchema,
  }
);
