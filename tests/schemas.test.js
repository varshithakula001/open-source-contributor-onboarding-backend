import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  userSignupSchema,
  contributorProfileUpdateSchema,
  createProjectSchema,
  updateProjectSchema,
  verifyProjectSchema,
  importSnapshotSchema,
  createIssueSchema,
  updateIssueSchema,
  submitInterestSchema,
  createContributionPlanSchema,
  updateContributionPlanSchema,
  createReviewSchema,
  contributorChatSchema,
  onboardingAgentSchema,
  formatZodErrors,
} from '../src/schemas/index.js';

describe('Phase 2: Zod Request Validation Schemas', () => {
  const validHexId = '507f1f77bcf86cd799439011';
  const validHexId2 = '507f1f77bcf86cd799439012';
  const validHexId3 = '507f1f77bcf86cd799439013';

  describe('User Signup Schema (Security & Role Boundaries)', () => {
    it('should validate a valid contributor signup payload', () => {
      const payload = {
        email: 'student@university.edu',
        password: 'securePassword123!',
        profile: {
          displayName: 'Student Contributor',
          skills: ['JavaScript', 'HTML'],
          experienceLevel: 'beginner',
          availableHoursPerWeek: 10,
        },
      };

      const result = userSignupSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should strictly reject attempts to self-assign maintainer or moderator roles', () => {
      const maintainerAttempt = {
        email: 'attacker@example.com',
        password: 'securePassword123!',
        role: 'maintainer', // Attack vector: self-promoting to maintainer
      };

      const resultMaintainer = userSignupSchema.safeParse(maintainerAttempt);
      assert.equal(resultMaintainer.success, false);
      const errors = formatZodErrors(resultMaintainer.error);
      assert.ok(
        errors.some((e) => e.message.includes('Self-assigning staff roles') || e.field === 'role'),
        'Must reject self-assigned maintainer role'
      );

      const moderatorAttempt = {
        email: 'attacker@example.com',
        password: 'securePassword123!',
        role: 'moderator',
      };

      const resultModerator = userSignupSchema.safeParse(moderatorAttempt);
      assert.equal(resultModerator.success, false);
    });

    it('should reject passwords shorter than 8 characters', () => {
      const shortPass = {
        email: 'user@example.com',
        password: 'short',
      };

      const result = userSignupSchema.safeParse(shortPass);
      assert.equal(result.success, false);
    });
  });

  describe('Contributor Profile Update Schema', () => {
    it('should validate valid profile updates', () => {
      const payload = {
        displayName: 'Jane Developer',
        skills: ['react', 'node.js', 'docker'],
        experienceLevel: 'intermediate',
        availableHoursPerWeek: 20,
      };

      const result = contributorProfileUpdateSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject invalid available hours (< 0 or > 168)', () => {
      const negativeHours = { availableHoursPerWeek: -5 };
      assert.equal(contributorProfileUpdateSchema.safeParse(negativeHours).success, false);

      const excessHours = { availableHoursPerWeek: 200 };
      assert.equal(contributorProfileUpdateSchema.safeParse(excessHours).success, false);
    });
  });

  describe('Project Creation & Verification Schemas', () => {
    it('should validate project creation payload with valid repository URL', () => {
      const payload = {
        name: 'Open Contributor Portal',
        description: 'Comprehensive portal helping students make first contributions.',
        repositoryUrl: 'https://github.com/example/open-portal',
        visibility: 'public',
        topics: ['onboarding', 'education'],
      };

      const result = createProjectSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject malformed repository URLs', () => {
      const badUrl = {
        name: 'Project',
        description: 'Valid project description for testing.',
        repositoryUrl: 'not_a_valid_url_string',
      };

      const result = createProjectSchema.safeParse(badUrl);
      assert.equal(result.success, false);
    });

    it('should enforce rejection reason when moderator rejects a project', () => {
      const rejectWithoutReason = {
        verificationStatus: 'rejected',
      };

      const resultNoReason = verifyProjectSchema.safeParse(rejectWithoutReason);
      assert.equal(resultNoReason.success, false);

      const rejectWithReason = {
        verificationStatus: 'rejected',
        rejectionReason: 'Repository does not have an open-source license.',
      };

      const resultWithReason = verifyProjectSchema.safeParse(rejectWithReason);
      assert.equal(resultWithReason.success, true);
    });
  });

  describe('Snapshot Import Schema', () => {
    it('should validate snapshot import parameters', () => {
      const payload = {
        version: 'v1.0.0',
        importSource: 'github-release-tag',
        contentDigest: 'sha256-abcdef1234567890',
      };

      const result = importSnapshotSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject missing version string', () => {
      const payload = {
        importSource: 'github',
      };

      const result = importSnapshotSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });

  describe('Issue Creation and Update Schemas', () => {
    it('should validate valid issue creation payload', () => {
      const payload = {
        issueNumber: 101,
        title: 'Add README instructions for local Ollama testing',
        description: 'Provide clear, step-by-step setup documentation for contributors.',
        requiredSkills: ['markdown', 'ollama'],
        estimatedEffort: 'weekend',
      };

      const result = createIssueSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject invalid issue status in update payload', () => {
      const payload = {
        status: 'invalid_status_enum',
      };

      const result = updateIssueSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });

  describe('Interest Submission Schema', () => {
    it('should validate interest submission with positive hours', () => {
      const payload = {
        declaredAvailableHours: 8,
        message: 'Looking forward to contributing this weekend!',
      };

      const result = submitInterestSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject zero or negative available hours', () => {
      const payload = {
        declaredAvailableHours: 0,
      };

      const result = submitInterestSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });

  describe('Contribution Plan Schemas (Role & Approval Guards)', () => {
    it('should validate a structured contribution plan with citations and steps', () => {
      const payload = {
        projectId: validHexId,
        issueId: validHexId2,
        snapshotId: validHexId3,
        planObjective: 'Set up local configuration with safe fallbacks.',
        proposedApproach: 'Introduce .env validation and safe fallbacks for missing services.',
        orderedImplementationSteps: [
          {
            stepNumber: 1,
            description: 'Implement Zod schema in config/env.js',
            targetFiles: ['src/config/env.js'],
          },
        ],
        supportingEvidence: [
          {
            snapshotVersion: 'v1.0.0',
            filePath: 'docs/SETUP.md',
            quoteOrExplanation: 'Refers to local environment setup',
          },
        ],
      };

      const result = createContributionPlanSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject contribution plans with empty implementation steps', () => {
      const emptySteps = {
        projectId: validHexId,
        issueId: validHexId2,
        snapshotId: validHexId3,
        planObjective: 'Plan without steps',
        proposedApproach: 'This approach lacks ordered implementation steps.',
        orderedImplementationSteps: [], // Disallowed empty steps array
      };

      const result = createContributionPlanSchema.safeParse(emptySteps);
      assert.equal(result.success, false);
    });

    it('should prevent contributors from self-approving their plans via update schema', () => {
      const selfApproveAttempt = {
        status: 'approved', // Disallowed: only maintainers can approve
      };

      const result = updateContributionPlanSchema.safeParse(selfApproveAttempt);
      assert.equal(result.success, false);

      const validSubmission = {
        status: 'submitted', // Allowed transition for contributor
      };

      const resultValid = updateContributionPlanSchema.safeParse(validSubmission);
      assert.equal(resultValid.success, true);
    });
  });

  describe('Maintainer Review Schema', () => {
    it('should validate approved, request_changes, and rejected decisions', () => {
      ['approved', 'request_changes', 'rejected'].forEach((decision) => {
        const payload = {
          decision,
          feedback: 'This implementation plan is comprehensive, well-grounded, and approved.',
        };
        const result = createReviewSchema.safeParse(payload);
        assert.equal(result.success, true);
      });
    });

    it('should reject invalid review decisions or feedback shorter than 10 characters', () => {
      const badDecision = {
        decision: 'needs_work', // Invalid enum
        feedback: 'Valid feedback length here.',
      };
      assert.equal(createReviewSchema.safeParse(badDecision).success, false);

      const shortFeedback = {
        decision: 'approved',
        feedback: 'LGTM', // Too short (< 10 chars)
      };
      assert.equal(createReviewSchema.safeParse(shortFeedback).success, false);
    });
  });

  describe('Chat and Onboarding Agent Schemas', () => {
    it('should validate member documentation chat request', () => {
      const payload = {
        projectId: validHexId,
        snapshotVersion: 'v1.0.0',
        message: 'Where are database configuration options documented?',
      };

      const result = contributorChatSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should validate onboarding agent request', () => {
      const payload = {
        query: 'Find a task I can start this weekend',
        projectId: validHexId,
        declaredSkills: ['javascript', 'react'],
        availableHours: 12,
      };

      const result = onboardingAgentSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('should reject onboarding agent requests with queries that are too short', () => {
      const payload = {
        query: 'Hi', // Under 3 characters
      };

      const result = onboardingAgentSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });
});
