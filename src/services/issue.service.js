import { Issue } from '../models/Issue.js';
import { Project } from '../models/Project.js';
import { Interest } from '../models/Interest.js';
import { isUserProjectMaintainer } from './project.service.js';
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
