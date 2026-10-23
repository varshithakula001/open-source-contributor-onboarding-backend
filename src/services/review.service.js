import { Review } from '../models/Review.js';
import { ContributionPlan } from '../models/ContributionPlan.js';
import { isUserProjectMaintainer } from './project.service.js';
import { ApiError } from '../utils/errors.js';

/**
 * Maintainer Contribution Plan Review Service
 * Records formal maintainer decision and feedback, and updates plan workflow status.
 * 
 * SECURITY MANDATE:
 * - Only verified maintainers of the target project may review plans.
 * - Platform moderators cannot review plans without a project-scoped maintainer grant.
 * - Contributors cannot review or self-approve their own plans.
 * - Rejects reviews on already finalized (approved/rejected) plans.
 */
export async function reviewContributionPlan(planId, maintainerUserId, { decision, feedback }) {
  const plan = await ContributionPlan.findById(planId);
  if (!plan) {
    throw new ApiError(404, 'PLAN_NOT_FOUND', 'Contribution plan not found.');
  }

  // Enforce project-scoped maintainer authorization
  const isAuthorized = await isUserProjectMaintainer(plan.projectId, maintainerUserId);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      'FORBIDDEN_NOT_MAINTAINER',
      'You do not have maintainer privileges for this specific project.'
    );
  }

  // Prevent self-review/self-approval
  if (plan.contributorId.toString() === maintainerUserId.toString()) {
    throw new ApiError(
      403,
      'SELF_REVIEW_FORBIDDEN',
      'Contributors cannot review or approve their own contribution plans.'
    );
  }

  // Reject invalid state transitions
  if (plan.status === 'approved') {
    throw new ApiError(
      400,
      'INVALID_STATE_TRANSITION',
      'This contribution plan has already been approved.'
    );
  }
  if (plan.status === 'rejected') {
    throw new ApiError(
      400,
      'INVALID_STATE_TRANSITION',
      'This contribution plan has already been rejected and cannot receive further reviews.'
    );
  }

  // Map review decision to plan workflow state
  const decisionToStatusMap = {
    approved: 'approved',
    request_changes: 'changes_requested',
    rejected: 'rejected',
  };

  const newPlanStatus = decisionToStatusMap[decision];
  if (!newPlanStatus) {
    throw new ApiError(400, 'INVALID_DECISION', `Invalid review decision: ${decision}`);
  }

  // 1. Create formal Review record
  const review = await Review.create({
    contributionPlanId: plan._id,
    projectId: plan.projectId,
    reviewingMaintainerId: maintainerUserId,
    decision,
    feedback,
    reviewedAt: new Date(),
  });

  // 2. Transition plan status
  plan.status = newPlanStatus;
  await plan.save();

  return {
    review,
    planStatus: plan.status,
  };
}
