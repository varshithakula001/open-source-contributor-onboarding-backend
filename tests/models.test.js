import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  User,
  Project,
  MaintainerGrant,
  Snapshot,
  Document,
  Chunk,
  Issue,
  Interest,
  ContributionPlan,
  Review,
  AgentRun,
} from '../src/models/index.js';

describe('Phase 2: Mongoose Models In-Memory Schema Validation', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyProjectId = new mongoose.Types.ObjectId();
  const dummySnapshotId = new mongoose.Types.ObjectId();
  const dummyDocId = new mongoose.Types.ObjectId();
  const dummyIssueId = new mongoose.Types.ObjectId();
  const dummyPlanId = new mongoose.Types.ObjectId();

  describe('User Model', () => {
    it('should validate a complete, valid user with default contributor role', async () => {
      const user = new User({
        email: 'Contributor@Example.COM',
        passwordHash: 'hashed_secret_string_123',
        profile: {
          displayName: 'Jane Doe',
          skills: ['JavaScript', 'React'],
          experienceLevel: 'intermediate',
          availableHoursPerWeek: 15,
        },
      });

      await user.validate();
      // Email should be normalized to lowercase
      assert.equal(user.email, 'contributor@example.com');
      assert.equal(user.role, 'contributor');
      assert.equal(user.emailVerified, false);
      assert.equal(user.isActive, true);
    });

    it('should fail validation if email is missing or malformed', async () => {
      const userNoEmail = new User({ passwordHash: 'hash123' });
      await assert.rejects(
        () => userNoEmail.validate(),
        (err) => err.errors.email !== undefined
      );

      const userBadEmail = new User({ email: 'not-an-email', passwordHash: 'hash123' });
      await assert.rejects(
        () => userBadEmail.validate(),
        (err) => err.errors.email !== undefined
      );
    });

    it('should reject unsupported user roles', async () => {
      const user = new User({
        email: 'test@example.com',
        passwordHash: 'hash123',
        role: 'superadmin', // Invalid role
      });

      await assert.rejects(
        () => user.validate(),
        (err) => err.errors.role !== undefined
      );
    });

    it('should correctly strip sensitive security fields via toSafeObject()', () => {
      const user = new User({
        email: 'test@example.com',
        passwordHash: 'secret_hash',
        emailVerificationTokenHash: 'token_hash',
        passwordResetTokenHash: 'reset_hash',
      });

      const safe = user.toSafeObject();
      assert.equal(safe.passwordHash, undefined);
      assert.equal(safe.emailVerificationTokenHash, undefined);
      assert.equal(safe.passwordResetTokenHash, undefined);
      assert.equal(safe.email, 'test@example.com');
    });
  });

  describe('Project Model', () => {
    it('should validate a valid project with default public visibility and pending approval', async () => {
      const project = new Project({
        name: 'Open Contributor Portal',
        slug: 'open-contributor-portal',
        description: 'A platform to help onboarding open-source contributors easily.',
        repositoryUrl: 'https://github.com/example/open-portal',
        ownerId: dummyUserId,
      });

      await project.validate();
      assert.equal(project.visibility, 'public');
      assert.equal(project.approvalStatus, 'pending');
    });

    it('should reject invalid project slugs with uppercase or special characters', async () => {
      const project = new Project({
        name: 'Test Project',
        slug: 'Invalid Slug with Spaces!',
        description: 'Valid description with sufficient length for project.',
        repositoryUrl: 'https://github.com/example/test',
        ownerId: dummyUserId,
      });

      await assert.rejects(
        () => project.validate(),
        (err) => err.errors.slug !== undefined
      );
    });

    it('should reject invalid visibility or approvalStatus values', async () => {
      const project = new Project({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Valid description for testing purposes.',
        repositoryUrl: 'https://github.com/example/test',
        ownerId: dummyUserId,
        visibility: 'hidden_secret', // Invalid visibility
        approvalStatus: 'promoted',   // Invalid approval status
      });

      await assert.rejects(
        () => project.validate(),
        (err) => err.errors.visibility !== undefined || err.errors.approvalStatus !== undefined
      );
    });
  });

  describe('MaintainerGrant Model', () => {
    it('should validate an active maintainer grant scoped to a specific project', async () => {
      const grant = new MaintainerGrant({
        projectId: dummyProjectId,
        userId: dummyUserId,
        grantedBy: dummyUserId,
        status: 'active',
      });

      await grant.validate();
      assert.equal(grant.status, 'active');
      assert.ok(grant.grantedAt);
    });

    it('should verify that a unique compound index is defined on projectId and userId', () => {
      const indexes = MaintainerGrant.schema.indexes();
      const hasCompoundUnique = indexes.some(
        ([fields, options]) => fields.projectId === 1 && fields.userId === 1 && options?.unique === true
      );
      assert.equal(hasCompoundUnique, true, 'MaintainerGrant must define unique compound index on { projectId, userId }');
    });
  });

  describe('Snapshot Model', () => {
    it('should validate a versioned snapshot with importing status', async () => {
      const snapshot = new Snapshot({
        projectId: dummyProjectId,
        version: 'v1.0.0',
        importSource: 'github-release-v1.0.0.tar.gz',
        importedBy: dummyUserId,
      });

      await snapshot.validate();
      assert.equal(snapshot.importStatus, 'importing');
      assert.equal(snapshot.isStale, false);
    });

    it('should verify unique compound index on projectId and version', () => {
      const indexes = Snapshot.schema.indexes();
      const hasVersionUnique = indexes.some(
        ([fields, options]) => fields.projectId === 1 && fields.version === 1 && options?.unique === true
      );
      assert.equal(hasVersionUnique, true, 'Snapshot must define unique compound index on { projectId, version }');
    });
  });

  describe('Document Model', () => {
    it('should validate an imported repository document', async () => {
      const doc = new Document({
        projectId: dummyProjectId,
        snapshotId: dummySnapshotId,
        filePath: 'docs/CONTRIBUTING.md',
        title: 'Contribution Guidelines',
        content: '# Contributing\nPlease follow our pull request process.',
        docType: 'guide',
      });

      await doc.validate();
      assert.equal(doc.visibility, 'public');
      assert.equal(doc.docType, 'guide');
    });

    it('should reject invalid docType', async () => {
      const doc = new Document({
        projectId: dummyProjectId,
        snapshotId: dummySnapshotId,
        filePath: 'test.md',
        title: 'Test',
        content: 'Content',
        docType: 'executable-script', // Disallowed docType
      });

      await assert.rejects(
        () => doc.validate(),
        (err) => err.errors.docType !== undefined
      );
    });
  });

  describe('Chunk Model (Vector Embedding Preparation)', () => {
    it('should validate chunk with an empty/unpopulated embedding array', async () => {
      const chunk = new Chunk({
        projectId: dummyProjectId,
        snapshotId: dummySnapshotId,
        documentId: dummyDocId,
        chunkIndex: 0,
        text: 'Segment text for chunking and vector embedding.',
      });

      await chunk.validate();
      assert.equal(chunk.chunkIndex, 0);
    });

    it('should validate chunk with a correct 768-dimensional embedding vector (nomic-embed-text)', async () => {
      const embedding768 = new Array(768).fill(0.0123);
      const chunk = new Chunk({
        projectId: dummyProjectId,
        snapshotId: dummySnapshotId,
        documentId: dummyDocId,
        chunkIndex: 1,
        text: 'Segment with vector embeddings.',
        embedding: embedding768,
      });

      await chunk.validate();
      assert.equal(chunk.embedding.length, 768);
    });

    it('should reject embedding vectors with incorrect dimensionality (e.g. 512 dimensions)', async () => {
      const embedding512 = new Array(512).fill(0.0123);
      const chunk = new Chunk({
        projectId: dummyProjectId,
        snapshotId: dummySnapshotId,
        documentId: dummyDocId,
        chunkIndex: 2,
        text: 'Segment with mismatched vector embeddings.',
        embedding: embedding512,
      });

      await assert.rejects(
        () => chunk.validate(),
        (err) => err.errors.embedding !== undefined
      );
    });
  });

  describe('Issue Model', () => {
    it('should validate an issue with default open status and weekend effort', async () => {
      const issue = new Issue({
        projectId: dummyProjectId,
        issueNumber: 1,
        title: 'Improve documentation for local setup',
        description: 'Update SETUP.md with Docker instructions.',
        requiredSkills: ['markdown', 'docker'],
      });

      await issue.validate();
      assert.equal(issue.status, 'open');
      assert.equal(issue.estimatedEffort, 'weekend');
      assert.equal(issue.isStaleSetup, false);
    });

    it('should reject invalid issue status', async () => {
      const issue = new Issue({
        projectId: dummyProjectId,
        issueNumber: 2,
        title: 'Valid Issue',
        description: 'Valid Description',
        status: 'archived_forever', // Invalid status
      });

      await assert.rejects(
        () => issue.validate(),
        (err) => err.errors.status !== undefined
      );
    });
  });

  describe('Interest Model', () => {
    it('should validate positive declared available hours', async () => {
      const interest = new Interest({
        issueId: dummyIssueId,
        contributorId: dummyUserId,
        declaredAvailableHours: 10,
        message: 'I have experience with this stack and can work this weekend.',
      });

      await interest.validate();
      assert.equal(interest.status, 'active');
    });

    it('should reject negative or zero available hours', async () => {
      const interest = new Interest({
        issueId: dummyIssueId,
        contributorId: dummyUserId,
        declaredAvailableHours: 0,
      });

      await assert.rejects(
        () => interest.validate(),
        (err) => err.errors.declaredAvailableHours !== undefined
      );
    });
  });

  describe('ContributionPlan Model', () => {
    it('should validate plan with required steps and default draft status', async () => {
      const plan = new ContributionPlan({
        contributorId: dummyUserId,
        projectId: dummyProjectId,
        issueId: dummyIssueId,
        snapshotId: dummySnapshotId,
        planObjective: 'Implement Docker Compose configuration for local dev.',
        proposedApproach: 'Create docker-compose.yml and update docs/SETUP.md with run instructions.',
        orderedImplementationSteps: [
          { stepNumber: 1, description: 'Write docker-compose.yml file', targetFiles: ['docker-compose.yml'] },
          { stepNumber: 2, description: 'Verify container boot and ports', targetFiles: [] },
        ],
      });

      await plan.validate();
      assert.equal(plan.status, 'draft', 'Contribution plan must strictly default to "draft"');
      assert.equal(plan.prerequisitesChecked, false);
    });

    it('should reject contribution plan with empty implementation steps', async () => {
      const plan = new ContributionPlan({
        contributorId: dummyUserId,
        projectId: dummyProjectId,
        issueId: dummyIssueId,
        snapshotId: dummySnapshotId,
        planObjective: 'Empty plan test',
        proposedApproach: 'Approach without steps',
        orderedImplementationSteps: [], // Disallowed empty steps array
      });

      await assert.rejects(
        () => plan.validate(),
        (err) => err.errors.orderedImplementationSteps !== undefined
      );
    });
  });

  describe('Review Model', () => {
    it('should validate a maintainer review with valid decision and feedback', async () => {
      const review = new Review({
        contributionPlanId: dummyPlanId,
        projectId: dummyProjectId,
        reviewingMaintainerId: dummyUserId,
        decision: 'approved',
        feedback: 'Excellent approach! The Docker configuration and steps are sound.',
      });

      await review.validate();
      assert.equal(review.decision, 'approved');
      assert.ok(review.reviewedAt);
    });

    it('should reject short or empty feedback', async () => {
      const review = new Review({
        contributionPlanId: dummyPlanId,
        projectId: dummyProjectId,
        reviewingMaintainerId: dummyUserId,
        decision: 'approved',
        feedback: 'Good', // Too short (< 10 chars)
      });

      await assert.rejects(
        () => review.validate(),
        (err) => err.errors.feedback !== undefined
      );
    });
  });

  describe('AgentRun Model', () => {
    it('should validate agent run with default pending status and tool execution records', async () => {
      const run = new AgentRun({
        userId: dummyUserId,
        projectId: dummyProjectId,
        userRequest: 'Find a task I can start this weekend matching JavaScript',
        toolExecutionRecords: [
          {
            toolName: 'findIssues',
            toolInput: { skills: ['javascript'], projectId: dummyProjectId.toString() },
            toolOutput: [{ issueNumber: 1, status: 'open' }],
            durationMs: 120,
          },
        ],
      });

      await run.validate();
      assert.equal(run.status, 'pending');
      assert.equal(run.toolExecutionRecords.length, 1);
    });

    it('should reject invalid agent run status', async () => {
      const run = new AgentRun({
        userId: dummyUserId,
        userRequest: 'Test request',
        status: 'executing_in_cloud', // Invalid status
      });

      await assert.rejects(
        () => run.validate(),
        (err) => err.errors.status !== undefined
      );
    });
  });
});
