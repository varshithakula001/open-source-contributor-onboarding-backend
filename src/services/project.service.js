import { Project } from '../models/Project.js';
import { Issue } from '../models/Issue.js';
import { MaintainerGrant } from '../models/MaintainerGrant.js';
import { ApiError } from '../utils/errors.js';

/**
 * Escapes special regex characters in a search string to prevent regex injection
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Verifies whether a given user holds active maintainer authority over a project.
 * Authority exists if the user is the project owner OR holds an active MaintainerGrant.
 * 
 * SECURITY BOUNDARY:
 * Platform moderators are NOT automatically granted project-level maintainer rights.
 */
export async function isUserProjectMaintainer(projectId, userId) {
  if (!projectId || !userId) return false;

  // 1. Check for active project-scoped MaintainerGrant
  const activeGrant = await MaintainerGrant.findOne({
    projectId,
    userId,
    status: 'active',
  });
  if (activeGrant) return true;

  // 2. Check if user is the registered owner/creator of the project
  const ownedProject = await Project.findOne({
    _id: projectId,
    ownerId: userId,
  });
  return !!ownedProject;
}

/**
 * Public Project Discovery Service
 * Retrieves approved, public projects with safe pagination, keyword search, and tag filtering.
 * 
 * SECURITY:
 * Never returns private or unapproved projects.
 * Excludes sensitive fields (ownerId, internal approval details, credentials).
 */
export async function getPublicProjects({ page = 1, limit = 10, search, topic, language }) {
  const query = {
    approvalStatus: 'approved',
    visibility: 'public',
  };

  if (search) {
    const escaped = escapeRegex(search);
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (topic) {
    query.topics = topic.toLowerCase();
  }

  if (language) {
    query.languages = language.toLowerCase();
  }

  const skip = (page - 1) * limit;

  const [total, projects] = await Promise.all([
    Project.countDocuments(query),
    Project.find(query)
      .select('name slug description repositoryUrl topics languages currentSnapshotVersion createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    projects,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Public Issue Browser Service
 * Returns eligible open issues for an approved public project.
 * 
 * SECURITY:
 * If project is nonexistent, private, or not approved, returns 404 to avoid leaking project metadata.
 * Only returns issues with status 'open'. Excludes taken and closed issues.
 */
export async function getPublicProjectIssues(projectId, { page = 1, limit = 10, skill, effort }) {
  // Confirm project exists and is approved + public
  const project = await Project.findById(projectId).select('name slug approvalStatus visibility').lean();
  if (!project || project.approvalStatus !== 'approved' || project.visibility !== 'public') {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found or is not publicly accessible.');
  }

  const query = {
    projectId: project._id,
    status: 'open', // Strict rule: only eligible open issues
  };

  if (skill) {
    query.requiredSkills = skill.toLowerCase();
  }

  if (effort) {
    query.estimatedEffort = effort;
  }

  const skip = (page - 1) * limit;

  const [total, issues] = await Promise.all([
    Issue.countDocuments(query),
    Issue.find(query)
      .select(
        'issueNumber issueSlug title description requiredSkills prerequisites setupSteps contributionRequirements labels estimatedEffort status isStaleSetup staleSetupNotes sourceEvidence createdAt'
      )
      .sort({ issueNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    project: {
      id: project._id,
      name: project.name,
      slug: project.slug,
    },
    issues,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Moderator Project Verification Service
 * Handles approval or rejection of registered projects.
 * 
 * SECURITY:
 * - Restricted to moderator role.
 * - Prevents moderators from self-approving projects they created.
 * - Keeps approvalStatus strictly separated from visibility. Private projects remain private.
 */
export async function verifyProject(projectId, moderatorUserId, { verificationStatus, rejectionReason }) {
  const project = await Project.findById(projectId);
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project not found.');
  }

  // Prevent conflict of interest: moderators cannot verify their own projects
  if (project.ownerId && project.ownerId.toString() === moderatorUserId.toString()) {
    throw new ApiError(
      403,
      'SELF_VERIFICATION_FORBIDDEN',
      'Moderators cannot verify their own projects. Another moderator must perform this review.'
    );
  }

  project.approvalStatus = verificationStatus;
  project.approvalInfo = {
    approvedBy: moderatorUserId,
    approvedAt: new Date(),
    rejectionReason: verificationStatus === 'rejected' ? rejectionReason : undefined,
  };

  await project.save();

  return {
    id: project._id,
    name: project.name,
    slug: project.slug,
    visibility: project.visibility,
    approvalStatus: project.approvalStatus,
    approvalInfo: project.approvalInfo,
    updatedAt: project.updatedAt,
  };
}
