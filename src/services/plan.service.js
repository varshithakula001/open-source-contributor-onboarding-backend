import { ContributionPlan } from '../models/ContributionPlan.js';
import { Project } from '../models/Project.js';
import { Issue } from '../models/Issue.js';
import { Snapshot } from '../models/Snapshot.js';
import { isUserProjectMaintainer } from './project.service.js';
import { ApiError } from '../utils/errors.js';

/**
 * Contribution Plan Submission Service
 * Allows a contributor to submit a structured implementation plan with evidence.
 * 
 * SECURITY:
 * - Contributor ID is derived securely from the authenticated session.
 * - Project, issue, and snapshot relationships are validated.
 * - Project must be approved and publicly accessible.
 * - Issue must be open and belong to the project.
 * - Snapshot must belong to the project.
 * - Plan status begins strictly in 'submitted' (never auto-approved).
 */
export async function createContributionPlan(contributorUserId, planData) {
  // 1. Confirm target project is approved and public
  const project = await Project.findById(planData.projectId).select('approvalStatus visibility').lean();
  if (!project || project.approvalStatus !== 'approved' || project.visibility !== 'public') {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project not found or is not approved/publicly accessible.');
  }

  // 2. Confirm target issue exists, belongs to project, and is open
  const issue = await Issue.findById(planData.issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Target issue not found.');
  }
  if (issue.projectId.toString() !== planData.projectId.toString()) {
    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'The specified issue does not belong to the target project.');
  }
  if (issue.status !== 'open') {
    throw new ApiError(
      400,
      'ISSUE_NOT_AVAILABLE',
      `Issue is not available for contribution plans (current status is "${issue.status}").`
    );
  }

  // 3. Confirm target snapshot exists and belongs to project
  const snapshot = await Snapshot.findById(planData.snapshotId);
  if (!snapshot) {
    throw new ApiError(404, 'SNAPSHOT_NOT_FOUND', 'Target snapshot not found.');
  }
  if (snapshot.projectId.toString() !== planData.projectId.toString()) {
    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'The specified snapshot does not belong to the target project.');
  }

  // 4. Create contribution plan in 'submitted' status
  const plan = await ContributionPlan.create({
    contributorId: contributorUserId,
    projectId: planData.projectId,
    issueId: planData.issueId,
    snapshotId: planData.snapshotId,
    planObjective: planData.planObjective,
    proposedApproach: planData.proposedApproach,
    orderedImplementationSteps: planData.orderedImplementationSteps,
    supportingEvidence: planData.supportingEvidence || [],
    prerequisitesChecked: planData.prerequisitesChecked || false,
    status: 'submitted', // Explicit workflow state: submitted for maintainer review
    submittedAt: new Date(),
  });

  return plan;
}

/**
 * Contribution Plan Retrieval Service
 * Retrieves a plan only if requester is the author OR an authorized maintainer of the project.
 * 
 * SECURITY:
 * - Unrelated contributors cannot view another contributor's plan.
 * - Maintainers without a grant for the specific project cannot view the plan.
 * - Global moderators are not granted universal read access without a MaintainerGrant.
 */
export async function getContributionPlanById(planId, requestingUserId) {
  const plan = await ContributionPlan.findById(planId);
  if (!plan) {
    throw new ApiError(404, 'PLAN_NOT_FOUND', 'Contribution plan not found.');
  }

  // Author can view their own plan
  if (plan.contributorId.toString() === requestingUserId.toString()) {
    return plan;
  }

  // Authorized project maintainer can view plans for their project
  const isMaintainer = await isUserProjectMaintainer(plan.projectId, requestingUserId);
  if (isMaintainer) {
    return plan;
  }

  // Access denied for all other users
  throw new ApiError(
    403,
    'FORBIDDEN',
    'Access denied. You do not have permission to view this contribution plan.'
  );
}

/**
 * Maintainer Review Inbox Service (Supplementary Endpoint)
 * Returns contribution plans awaiting review for an authorized project.
 * 
 * SECURITY:
 * - Requires verified maintainer privileges on the specific project.
 * - Returns only plans belonging to the target project.
 */
export async function getProjectContributionPlans(projectId, maintainerUserId, { page = 1, limit = 10, status = 'submitted' }) {
  // Confirm user has maintainer authority on this project
  const isAuthorized = await isUserProjectMaintainer(projectId, maintainerUserId);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      'FORBIDDEN_NOT_MAINTAINER',
      'You do not have maintainer privileges for this specific project.'
    );
  }

  const query = {
    projectId,
    ...(status ? { status } : { status: 'submitted' }),
  };

  const skip = (page - 1) * limit;

  const [total, plans] = await Promise.all([
    ContributionPlan.countDocuments(query),
    ContributionPlan.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    plans,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}
