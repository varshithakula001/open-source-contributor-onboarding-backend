import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Issue } from '../../models/Issue.js';
import { Project } from '../../models/Project.js';
import { isUserProjectMaintainer } from '../../services/project.service.js';
import { ApiError } from '../../utils/errors.js';

/**
 * Zod Input Validation Schema for checkIssueAvailability tool.
 */
export const checkIssueAvailabilityInputSchema = z.object({
  issueId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Issue ID format')
    .describe('24-character hexadecimal MongoDB ObjectId of the issue to verify'),
});

/**
 * Authoritatively verifies whether a candidate issue remains open and available in the database.
 *
 * STRICT ARCHITECTURAL BOUNDARY:
 * - Does NOT assign or reserve the issue.
 * - Does NOT modify issue status or database state.
 * - Database is the sole source of truth (never trusts previous search results or model assertions).
 *
 * @param {Object} input - Validated input { issueId }
 * @param {Object} context - Execution context { userId, userRole }
 * @returns {Promise<Object>} Authoritative availability check outcome
 */
export async function checkIssueAvailability(input, context = {}) {
  const parsedInput = checkIssueAvailabilityInputSchema.parse(input || {});
  const { userId, userRole } = context;

  // 1. Authoritative query directly from MongoDB
  const issue = await Issue.findById(parsedInput.issueId).lean();
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }

  // 2. Recheck project approval and visibility
  const project = await Project.findById(issue.projectId).lean();
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Associated project not found.');
  }

  const isMaintainer = userId ? await isUserProjectMaintainer(project._id, userId) : false;
  const isModerator = userRole === 'moderator';

  if (project.approvalStatus !== 'approved' && !isMaintainer && !isModerator) {
    return {
      issueId: issue._id.toString(),
      isAvailable: false,
      status: issue.status,
      checkedAt: new Date().toISOString(),
      reason: 'Associated project is not approved for public onboarding.',
      disclaimer: 'This check evaluates live database availability only and does not constitute an assignment.',
    };
  }

  if (project.visibility === 'private' && !isMaintainer) {
    return {
      issueId: issue._id.toString(),
      isAvailable: false,
      status: issue.status,
      checkedAt: new Date().toISOString(),
      reason: 'Access denied: issue belongs to a private repository.',
      disclaimer: 'This check evaluates live database availability only and does not constitute an assignment.',
    };
  }

  // 3. Evaluate availability
  const isStatusOpen = issue.status === 'open';
  const hasNoAssignee = !issue.assignedContributorId;
  const isAvailable = isStatusOpen && hasNoAssignee;

  let reason = 'Issue is open and available for contributor onboarding.';
  if (issue.status === 'taken') {
    reason = 'Issue is taken by another contributor.';
  } else if (issue.status === 'closed') {
    reason = 'Issue is closed.';
  } else if (issue.assignedContributorId) {
    reason = 'Issue has an assigned contributor.';
  }

  const checkedAt = new Date().toISOString();

  return {
    issueId: issue._id.toString(),
    issueNumber: issue.issueNumber,
    projectId: project._id.toString(),
    projectName: project.name,
    title: issue.title,
    status: issue.status,
    isAvailable,
    checkedAt,
    reason,
    assignedContributorId: issue.assignedContributorId ? issue.assignedContributorId.toString() : null,
    disclaimer: `This check confirms availability in the database at ${checkedAt}. It does NOT reserve, assign, or approve the issue. A formal contribution plan must still be submitted and approved by maintainers.`,
  };
}

/**
 * LangChain DynamicStructuredTool export for checkIssueAvailability.
 */
export const checkIssueAvailabilityTool = tool(
  async (input, config) => {
    const context = config?.configurable?.context || {};
    const results = await checkIssueAvailability(input, context);
    return JSON.stringify(results);
  },
  {
    name: 'checkIssueAvailability',
    description: 'Authoritatively checks whether an issue is currently open and unassigned in the database. Does NOT assign or reserve.',
    schema: checkIssueAvailabilityInputSchema,
  }
);
