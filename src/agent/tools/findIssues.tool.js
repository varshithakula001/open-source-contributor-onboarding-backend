import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import mongoose from 'mongoose';
import { Issue } from '../../models/Issue.js';
import { Project } from '../../models/Project.js';
import { User } from '../../models/User.js';
import { isUserProjectMaintainer } from '../../services/project.service.js';
import { generateEmbedding } from '../../services/embedding.service.js';
import { searchSimilarIssues } from '../../services/issue.service.js';
import { ApiError } from '../../utils/errors.js';

/**
 * Zod Input Validation Schema for findIssues tool.
 */
export const findIssuesInputSchema = z.object({
  skills: z
    .array(z.string().trim().toLowerCase())
    .optional()
    .describe('List of contributor programming skills or technologies (e.g. ["javascript", "react"])'),
  projectId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid Project ID format')
    .optional()
    .describe('Optional target project ObjectId to limit discovery to one specific project'),
  availableHours: z
    .number()
    .min(1, 'Available hours must be at least 1')
    .max(168)
    .optional()
    .describe('Number of hours the contributor has available (e.g. 10 for a weekend)'),
  effort: z
    .enum(['hours', 'weekend', 'few_days', 'week_plus'])
    .optional()
    .describe('Estimated effort category: "hours", "weekend", "few_days", or "week_plus"'),
  interests: z
    .array(z.string().trim())
    .optional()
    .describe('Contributor interest areas (e.g. ["documentation", "testing", "ai"])'),
  query: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe('Natural language goal or preference (e.g. "Find a task I can start this weekend")'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of candidate issues to return (default: 5)'),
});

/**
 * Maps available hours to estimated effort category.
 */
function mapHoursToEffort(hours) {
  if (!hours) return 'weekend';
  if (hours <= 8) return 'hours';
  if (hours <= 20) return 'weekend';
  if (hours <= 40) return 'few_days';
  return 'week_plus';
}

/**
 * Discovers candidate open-source issues for an authenticated contributor.
 *
 * SECURITY MANDATE:
 * - Contributor identity is derived exclusively from server context, NEVER from model input.
 * - Restricts discovery to approved public projects, or authorized private projects.
 * - Strictly excludes taken and closed issues.
 *
 * @param {Object} input - Validated tool inputs
 * @param {Object} context - Server execution context { userId, userRole }
 * @returns {Promise<Array<Object>>} Structured candidates
 */
export async function findIssues(input, context = {}) {
  const parsedInput = findIssuesInputSchema.parse(input || {});
  const { userId, userRole } = context;

  // 1. Retrieve authenticated contributor profile from MongoDB
  let profileSkills = [];
  let profileInterests = [];
  let userAvailableHours = 10;

  if (userId) {
    const user = await User.findById(userId).lean();
    if (user && user.profile) {
      profileSkills = (user.profile.skills || []).map((s) => s.toLowerCase());
      profileInterests = user.profile.interests || [];
      if (user.profile.availableHoursPerWeek) {
        userAvailableHours = user.profile.availableHoursPerWeek;
      }
    }
  }

  // Combine profile and input criteria
  const effectiveSkills = (parsedInput.skills && parsedInput.skills.length > 0)
    ? parsedInput.skills.map((s) => s.toLowerCase())
    : profileSkills;

  const effectiveInterests = (parsedInput.interests && parsedInput.interests.length > 0)
    ? parsedInput.interests
    : profileInterests;

  const effectiveHours = parsedInput.availableHours || userAvailableHours;
  const preferredEffort = parsedInput.effort || (parsedInput.query?.toLowerCase().includes('weekend') ? 'weekend' : mapHoursToEffort(effectiveHours));

  // 2. Project Authorization and Visibility Filtering
  let allowedProjectFilter = {};
  const projectMap = {};

  if (parsedInput.projectId) {
    const project = await Project.findById(parsedInput.projectId).lean();
    if (!project) {
      throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project not found.');
    }

    const isMaintainer = userId ? await isUserProjectMaintainer(project._id, userId) : false;
    const isModerator = userRole === 'moderator';

    if (project.approvalStatus !== 'approved' && !isMaintainer && !isModerator) {
      throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project not found or is not approved.');
    }

    if (project.visibility === 'private' && !isMaintainer) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to private project issues.');
    }

    allowedProjectFilter = { _id: project._id };
    projectMap[project._id.toString()] = project.name;
  } else {
    // Contributor discovery across approved public projects
    const publicProjects = await Project.find({
      approvalStatus: 'approved',
      visibility: 'public',
    })
      .select('_id name')
      .lean();

    const publicProjectIds = publicProjects.map((p) => {
      projectMap[p._id.toString()] = p.name;
      return p._id;
    });

    if (publicProjectIds.length === 0) {
      return [];
    }

    allowedProjectFilter = { _id: { $in: publicProjectIds } };
  }

  // 3. Issue Search & Matching
  const limit = parsedInput.limit || 5;
  let candidates = [];
  let matchingMethod = 'deterministic_matching';

  // Attempt semantic issue vector search if query is provided
  if (parsedInput.query && parsedInput.query.trim().length >= 3) {
    try {
      const queryVector = await generateEmbedding(parsedInput.query);
      const vectorResults = await searchSimilarIssues({
        projectId: parsedInput.projectId,
        queryVector,
        limit,
        status: 'open',
      });

      if (vectorResults && vectorResults.length > 0) {
        // Filter out candidates outside allowed projects
        const allowedIds = new Set(Object.keys(projectMap));
        const filteredVectorResults = vectorResults.filter((r) => allowedIds.has(r.projectId.toString()));

        if (filteredVectorResults.length > 0) {
          candidates = filteredVectorResults;
          matchingMethod = filteredVectorResults[0].matchingMethod || 'semantic_vector_search';
        }
      }
    } catch {
      // Gracefully fall back to deterministic matching on embedding/index error
      matchingMethod = 'deterministic_fallback';
    }
  }

  // Deterministic matching fallback if vector search was unused or produced no candidates
  if (candidates.length === 0) {
    const rawIssues = await Issue.find({
      projectId: allowedProjectFilter._id,
      status: 'open', // STRICT AVAILABILITY: Never return taken or closed issues
    }).lean();

    if (rawIssues.length === 0) {
      return [];
    }

    // Score issues based on skill overlap, effort alignment, and interest keywords
    const scoredIssues = rawIssues.map((issue) => {
      let score = 0;
      const matchReasons = [];
      const requiredSkills = (issue.requiredSkills || []).map((s) => s.toLowerCase());

      // Skill overlap
      const matchedSkills = requiredSkills.filter((s) => effectiveSkills.includes(s));
      if (matchedSkills.length > 0) {
        score += matchedSkills.length * 3;
        matchReasons.push(`Matches your skills: ${matchedSkills.join(', ')}.`);
      }

      // Effort alignment
      if (issue.estimatedEffort === preferredEffort) {
        score += 4;
        matchReasons.push(`Estimated effort (${issue.estimatedEffort}) fits your target timeframe.`);
      } else if (issue.estimatedEffort === 'hours' && preferredEffort === 'weekend') {
        score += 3;
        matchReasons.push(`Short task (${issue.estimatedEffort}) can easily be completed within your weekend availability.`);
      }

      // Interest keyword overlap
      const titleAndDesc = `${issue.title} ${issue.description} ${(issue.labels || []).join(' ')}`.toLowerCase();
      const matchedInterests = effectiveInterests.filter((interest) =>
        titleAndDesc.includes(interest.toLowerCase())
      );
      if (matchedInterests.length > 0) {
        score += matchedInterests.length * 2;
        matchReasons.push(`Relates to your declared interests: ${matchedInterests.join(', ')}.`);
      }

      if (matchReasons.length === 0) {
        matchReasons.push('Good introductory onboarding task with open availability.');
      }

      const skillGaps = requiredSkills.filter((s) => !effectiveSkills.includes(s));

      return {
        ...issue,
        score,
        matchReasons,
        skillGaps,
        matchingMethod,
      };
    });

    scoredIssues.sort((a, b) => b.score - a.score);
    candidates = scoredIssues.slice(0, limit);
  }

  // 4. Return structured, sanitized candidate records enriched with match reasons & skill gaps
  return candidates.map((cand) => {
    const pId = cand.projectId.toString();
    const requiredSkills = (cand.requiredSkills || []).map((s) => s.toLowerCase());
    const matchedSkills = requiredSkills.filter((s) => effectiveSkills.includes(s));
    const skillGaps = cand.skillGaps || requiredSkills.filter((s) => !effectiveSkills.includes(s));

    const matchReasons = cand.matchReasons ? [...cand.matchReasons] : [];

    if (matchedSkills.length > 0 && !matchReasons.some((r) => r.includes('skills'))) {
      matchReasons.push(`Matches your skills: ${matchedSkills.join(', ')}.`);
    }

    if (cand.estimatedEffort === preferredEffort) {
      if (!matchReasons.some((r) => r.includes('timeframe') || r.includes('fits') || r.includes('weekend'))) {
        matchReasons.push(`Estimated effort (${cand.estimatedEffort}) fits your target timeframe.`);
      }
    } else if (cand.estimatedEffort === 'hours' && preferredEffort === 'weekend') {
      if (!matchReasons.some((r) => r.includes('timeframe') || r.includes('weekend'))) {
        matchReasons.push(`Short task (${cand.estimatedEffort}) can easily be completed within your weekend availability.`);
      }
    }

    if (matchReasons.length === 0) {
      matchReasons.push('Good introductory onboarding task with open availability.');
    }

    return {
      issueId: cand._id.toString(),
      projectId: pId,
      projectName: projectMap[pId] || 'Open Source Project',
      issueNumber: cand.issueNumber,
      title: cand.title,
      description: cand.description,
      status: cand.status,
      requiredSkills: cand.requiredSkills || [],
      prerequisites: cand.prerequisites || [],
      setupSteps: cand.setupSteps || [],
      estimatedEffort: cand.estimatedEffort || 'weekend',
      matchReasons,
      skillGaps,
      sourceEvidence: cand.sourceEvidence || null,
      matchingMethod: cand.matchingMethod || matchingMethod,
    };
  });
}

/**
 * LangChain DynamicStructuredTool export for findIssues.
 */
export const findIssuesTool = tool(
  async (input, config) => {
    const context = config?.configurable?.context || {};
    const results = await findIssues(input, context);
    return JSON.stringify(results);
  },
  {
    name: 'findIssues',
    description: 'Finds candidate open-source issues matching contributor skills, available hours, and effort. Never returns taken or closed issues.',
    schema: findIssuesInputSchema,
  }
);
