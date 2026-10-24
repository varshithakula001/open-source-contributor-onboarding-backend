import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';

// Tools & Agent Services
import {
  findIssues,
  findIssuesInputSchema,
} from '../src/agent/tools/findIssues.tool.js';
import {
  inspectPrerequisites,
  inspectPrerequisitesInputSchema,
} from '../src/agent/tools/inspectPrerequisites.tool.js';
import {
  checkIssueAvailability,
  checkIssueAvailabilityInputSchema,
} from '../src/agent/tools/checkIssueAvailability.tool.js';
import {
  runOnboardingAgent,
  setAgentLlmGenerator,
  resetAgentLlmGenerator,
  generateStarterPlanText,
} from '../src/agent/onboardingAgent.js';
import { executeOnboardingAgent } from '../src/services/agent.service.js';
import {
  generateIssueEmbeddingText,
  indexIssueEmbedding,
  searchSimilarIssues,
} from '../src/services/issue.service.js';
import {
  setEmbeddingGenerator,
  resetEmbeddingGenerator,
} from '../src/services/embedding.service.js';

// Models
import { Project } from '../src/models/Project.js';
import { Issue } from '../src/models/Issue.js';
import { Snapshot } from '../src/models/Snapshot.js';
import { Chunk } from '../src/models/Chunk.js';
import { User } from '../src/models/User.js';
import { MaintainerGrant } from '../src/models/MaintainerGrant.js';
import { AgentRun } from '../src/models/AgentRun.js';
import { ContributionPlan } from '../src/models/ContributionPlan.js';

import { setSimulatedDatabaseConnected } from '../src/config/session.js';

describe('Phase 6: Purposeful AI-Powered Onboarding Agent Test Suite', () => {
  // Mock Identifiers
  const dummyContributorId = new mongoose.Types.ObjectId();
  const dummyMaintainerId = new mongoose.Types.ObjectId();
  const dummyModeratorId = new mongoose.Types.ObjectId();
  const dummyProjectId = new mongoose.Types.ObjectId();
  const dummyPrivateProjectId = new mongoose.Types.ObjectId();
  const dummySnapshotId = new mongoose.Types.ObjectId();
  const dummyDocId = new mongoose.Types.ObjectId();
  const dummyIssueId = new mongoose.Types.ObjectId();
  const dummyIssue2Id = new mongoose.Types.ObjectId();

  // Helper to create chainable query mocks for Mongoose find/findOne
  function mockQuery(val) {
    const p = Promise.resolve(val);
    p.lean = async () => val;
    p.distinct = async () => (Array.isArray(val) ? val.map((x) => x._id || x) : [dummyDocId]);
    p.select = () => mockQuery(val);
    p.sort = () => mockQuery(val);
    p.skip = () => mockQuery(val);
    p.limit = () => mockQuery(val);
    return p;
  }

  // Safe mock user for authentication tests
  const mockContributor = {
    _id: dummyContributorId,
    email: 'contributor@example.com',
    role: 'contributor',
    isActive: true,
    emailVerified: true,
    sessionVersion: 1,
    profile: {
      displayName: 'Alice Student',
      skills: ['javascript', 'node.js', 'react'],
      interests: ['documentation', 'testing'],
      experienceLevel: 'beginner',
      availableHoursPerWeek: 15,
    },
    toSafeObject() {
      return {
        _id: this._id,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
        emailVerified: this.emailVerified,
      };
    },
  };

  const mockMaintainer = {
    _id: dummyMaintainerId,
    email: 'maintainer@example.com',
    role: 'maintainer',
    isActive: true,
    emailVerified: true,
    sessionVersion: 1,
    profile: {
      displayName: 'Bob Maintainer',
      skills: ['javascript', 'python'],
      availableHoursPerWeek: 20,
    },
    toSafeObject() {
      return {
        _id: this._id,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
        emailVerified: this.emailVerified,
      };
    },
  };

  const mockModerator = {
    _id: dummyModeratorId,
    email: 'moderator@example.com',
    role: 'moderator',
    isActive: true,
    emailVerified: true,
    sessionVersion: 1,
    profile: {
      displayName: 'Charlie Mod',
      skills: [],
      availableHoursPerWeek: 5,
    },
    toSafeObject() {
      return {
        _id: this._id,
        email: this.email,
        role: this.role,
        isActive: this.isActive,
        emailVerified: this.emailVerified,
      };
    },
  };

  // Deterministic 768-dim test vector generator
  function makeMockVector(seed = 1) {
    const vec = new Array(768).fill(0);
    for (let i = 0; i < 768; i++) {
      vec[i] = Math.sin(seed * (i + 1));
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map((v) => v / norm);
  }

  // Session helper for authenticated route testing
  async function createAuthSession(userRecord) {
    const agent = request.agent(app);
    await agent.post('/api/test-session').send({
      userId: userRecord._id.toString(),
      sessionVersion: userRecord.sessionVersion || 1,
    });
    const csrfRes = await agent.get('/api/auth/csrf');
    const csrfToken = csrfRes.body.data.csrfToken;
    return { agent, csrfToken };
  }

  // Preserve model stubs
  let originalMaintainerGrantFindOne;
  let originalProjectFindOne;
  let originalProjectFindById;
  let originalProjectFind;
  let originalUserFindById;
  let originalIssueFind;
  let originalIssueFindById;
  let originalSnapshotFindById;
  let originalSnapshotFindOne;
  let originalChunkFind;
  let originalAgentRunSave;
  let originalIssueAggregate;

  beforeEach(() => {
    setSimulatedDatabaseConnected(true);

    // Mock embedding generator
    setEmbeddingGenerator(async (text) => makeMockVector(text.length || 1));

    // Mock agent LLM generator
    setAgentLlmGenerator(async ({ issue }) => {
      return `Recommended task #${issue.issueNumber} ("${issue.title}") is ideal for your weekend schedule. Inspect local setup instructions first.`;
    });

    originalMaintainerGrantFindOne = MaintainerGrant.findOne;
    originalProjectFindOne = Project.findOne;
    originalProjectFindById = Project.findById;
    originalProjectFind = Project.find;
    originalUserFindById = User.findById;
    originalIssueFind = Issue.find;
    originalIssueFindById = Issue.findById;
    originalSnapshotFindById = Snapshot.findById;
    originalSnapshotFindOne = Snapshot.findOne;
    originalChunkFind = Chunk.find;
    originalAgentRunSave = AgentRun.prototype.save;
    originalIssueAggregate = Issue.aggregate;

    MaintainerGrant.findOne = () => mockQuery(null);
    Project.findOne = () => mockQuery(null);
    User.findById = () => mockQuery(mockContributor);

    AgentRun.prototype.save = async function () {
      if (!this._id) {
        this._id = new mongoose.Types.ObjectId();
      }
      return this;
    };

    Issue.aggregate = async () => {
      const err = new Error('Unrecognized pipeline stage $vectorSearch');
      err.code = 40324;
      throw err;
    };
  });

  afterEach(() => {
    setSimulatedDatabaseConnected(null);
    resetEmbeddingGenerator();
    resetAgentLlmGenerator();

    MaintainerGrant.findOne = originalMaintainerGrantFindOne;
    Project.findOne = originalProjectFindOne;
    Project.findById = originalProjectFindById;
    Project.find = originalProjectFind;
    User.findById = originalUserFindById;
    Issue.find = originalIssueFind;
    Issue.findById = originalIssueFindById;
    Snapshot.findById = originalSnapshotFindById;
    Snapshot.findOne = originalSnapshotFindOne;
    Chunk.find = originalChunkFind;
    AgentRun.prototype.save = originalAgentRunSave;
    Issue.aggregate = originalIssueAggregate;
  });

  // =========================================================================
  // 1. BOUNDED AGENT TOOLS UNIT TESTS
  // =========================================================================
  describe('1. Bounded Agent Tools', () => {
    describe('Tool 1: findIssues', () => {
      it('should find suitable open issues matching contributor skills and effort', async () => {
        Project.find = () =>
          mockQuery([
            { _id: dummyProjectId, name: 'Open Web Project', approvalStatus: 'approved', visibility: 'public' },
          ]);

        Issue.find = () =>
          mockQuery([
            {
              _id: dummyIssueId,
              projectId: dummyProjectId,
              issueNumber: 101,
              title: 'Add responsive navigation tests',
              description: 'Write unit tests in React and Node.js for nav component.',
              requiredSkills: ['react', 'node.js'],
              estimatedEffort: 'weekend',
              status: 'open',
              prerequisites: ['Node 20+ installed'],
              setupSteps: ['npm install', 'npm test'],
              labels: ['testing', 'good-first-issue'],
            },
          ]);

        const candidates = await findIssues(
          { query: 'Find a task I can start this weekend', availableHours: 12 },
          { userId: dummyContributorId, userRole: 'contributor' }
        );

        assert.equal(candidates.length, 1);
        const cand = candidates[0];
        assert.equal(cand.issueNumber, 101);
        assert.equal(cand.status, 'open');
        assert.equal(cand.estimatedEffort, 'weekend');
        assert.ok(cand.matchReasons.some((r) => r.includes('skills')));
        assert.ok(cand.matchReasons.some((r) => r.includes('weekend') || r.includes('timeframe')));
      });

      it('should strictly filter out taken and closed issues', async () => {
        Project.find = () =>
          mockQuery([
            { _id: dummyProjectId, name: 'Open Web Project', approvalStatus: 'approved', visibility: 'public' },
          ]);

        // Issue.find should be queried with status: 'open' only
        let capturedQuery = null;
        Issue.find = (q) => {
          capturedQuery = q;
          return mockQuery([]);
        };

        await findIssues({}, { userId: dummyContributorId, userRole: 'contributor' });

        assert.equal(capturedQuery.status, 'open');
      });

      it('should reject access to private projects for contributors without grant', async () => {
        Project.findById = () =>
          mockQuery({
            _id: dummyPrivateProjectId,
            name: 'Secret Internal Project',
            approvalStatus: 'approved',
            visibility: 'private',
            ownerId: dummyMaintainerId,
          });

        MaintainerGrant.findOne = () => mockQuery(null); // No maintainer grant

        await assert.rejects(
          () =>
            findIssues(
              { projectId: dummyPrivateProjectId.toString() },
              { userId: dummyContributorId, userRole: 'contributor' }
            ),
          (err) => err.code === 'FORBIDDEN'
        );
      });

      it('should validate inputs using findIssuesInputSchema and reject invalid arguments', () => {
        assert.throws(() => findIssuesInputSchema.parse({ availableHours: -5 }), /at least 1/i);
        assert.throws(() => findIssuesInputSchema.parse({ effort: 'invalid_effort' }), /invalid/i);
        assert.throws(() => findIssuesInputSchema.parse({ projectId: 'not-an-objectid' }), /format/i);
      });

      it('should handle missing contributor profile information gracefully with sensible defaults', async () => {
        User.findById = () => mockQuery({ _id: dummyContributorId }); // User without profile object
        Project.find = () => mockQuery([{ _id: dummyProjectId, name: 'Default Project' }]);
        Issue.find = () =>
          mockQuery([
            {
              _id: dummyIssueId,
              projectId: dummyProjectId,
              issueNumber: 1,
              title: 'Default issue',
              status: 'open',
              estimatedEffort: 'weekend',
            },
          ]);

        const candidates = await findIssues({}, { userId: dummyContributorId, userRole: 'contributor' });
        assert.equal(candidates.length, 1);
        assert.ok(candidates[0].matchReasons.length > 0);
      });
    });

    describe('Tool 2: inspectPrerequisites', () => {
      it('should inspect issue prerequisites, setup steps, and supporting repository documentation', async () => {
        Issue.findById = () =>
          mockQuery({
            _id: dummyIssueId,
            projectId: dummyProjectId,
            snapshotId: dummySnapshotId,
            issueNumber: 42,
            title: 'Implement Vector Indexing',
            requiredSkills: ['mongodb', 'javascript'],
            prerequisites: ['Docker installed', 'MongoDB Atlas account'],
            setupSteps: ['Clone repo', 'npm install', 'Configure .env'],
            sourceEvidence: { filePaths: ['README.md', 'SETUP.md'] },
          });

        Project.findById = () =>
          mockQuery({
            _id: dummyProjectId,
            name: 'Vector Repo',
            approvalStatus: 'approved',
            visibility: 'public',
          });

        Snapshot.findById = () =>
          mockQuery({
            _id: dummySnapshotId,
            version: 'v1.2.0',
            isStale: false,
          });

        Chunk.find = () =>
          mockQuery([
            {
              text: 'Prerequisite instructions: Install Docker and Node.js v20+.',
              metadata: {
                filePath: 'SETUP.md',
                sectionTitle: 'Environment Setup',
                snapshotVersion: 'v1.2.0',
                startLine: 1,
                endLine: 20,
              },
            },
          ]);

        const result = await inspectPrerequisites(
          { issueId: dummyIssueId.toString() },
          { userId: dummyContributorId, userRole: 'contributor' }
        );

        assert.equal(result.issueNumber, 42);
        assert.equal(result.snapshotVersion, 'v1.2.0');
        assert.equal(result.snapshotFreshnessStatus, 'current');
        assert.equal(result.staleWarning, null);
        assert.equal(result.setupPrerequisites.length, 2);
        assert.equal(result.documentationReferences.length, 1);
        assert.equal(result.documentationReferences[0].filePath, 'SETUP.md');
      });

      it('should detect stale documentation snapshot and report warning', async () => {
        Issue.findById = () =>
          mockQuery({
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 42,
            title: 'Stale task',
            requiredSkills: ['node.js'],
            isStaleSetup: true,
            staleSetupNotes: 'Upgraded to Node 22, previous instructions are outdated.',
          });

        Project.findById = () =>
          mockQuery({
            _id: dummyProjectId,
            name: 'Stale Project',
            approvalStatus: 'approved',
            visibility: 'public',
          });

        Snapshot.findOne = () =>
          mockQuery({
            _id: dummySnapshotId,
            version: 'v1.0.0',
            isStale: true,
            staleReason: 'Major refactor pending',
          });

        Chunk.find = () => mockQuery([]);

        const result = await inspectPrerequisites(
          { issueId: dummyIssueId.toString() },
          { userId: dummyContributorId, userRole: 'contributor' }
        );

        assert.equal(result.snapshotFreshnessStatus, 'stale');
        assert.ok(result.staleWarning !== null);
        assert.ok(result.staleWarning.includes('Upgraded to Node 22'));
      });

      it('should validate inputs using inspectPrerequisitesInputSchema', () => {
        assert.throws(() => inspectPrerequisitesInputSchema.parse({ issueId: 'invalid' }), /format/i);
      });
    });

    describe('Tool 3: checkIssueAvailability', () => {
      it('should authoritatively confirm an open issue is available without reservation', async () => {
        Issue.findById = () =>
          mockQuery({
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 15,
            title: 'Open bug fix',
            status: 'open',
            assignedContributorId: null,
          });

        Project.findById = () =>
          mockQuery({
            _id: dummyProjectId,
            name: 'Open Project',
            approvalStatus: 'approved',
            visibility: 'public',
          });

        const result = await checkIssueAvailability(
          { issueId: dummyIssueId.toString() },
          { userId: dummyContributorId, userRole: 'contributor' }
        );

        assert.equal(result.isAvailable, true);
        assert.equal(result.status, 'open');
        assert.ok(result.checkedAt);
        assert.ok(result.disclaimer.includes('does NOT reserve'));
      });

      it('should report issue as unavailable if status is taken or closed', async () => {
        Issue.findById = () =>
          mockQuery({
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 16,
            title: 'Claimed issue',
            status: 'taken',
            assignedContributorId: new mongoose.Types.ObjectId(),
          });

        Project.findById = () =>
          mockQuery({
            _id: dummyProjectId,
            name: 'Open Project',
            approvalStatus: 'approved',
            visibility: 'public',
          });

        const result = await checkIssueAvailability(
          { issueId: dummyIssueId.toString() },
          { userId: dummyContributorId, userRole: 'contributor' }
        );

        assert.equal(result.isAvailable, false);
        assert.equal(result.status, 'taken');
        assert.ok(result.reason.includes('taken'));
      });
    });
  });

  // =========================================================================
  // 2. SEMANTIC ISSUE EMBEDDINGS & VECTOR SEARCH
  // =========================================================================
  describe('2. Semantic Issue Embeddings & Vector Search', () => {
    it('should generate composite embedding text representing issue metadata', () => {
      const issue = {
        title: 'Fix CSRF bug in auth flow',
        description: 'Synchronizer token header not evaluated properly.',
        requiredSkills: ['javascript', 'express'],
        labels: ['security', 'bug'],
        prerequisites: ['Read CSRF docs'],
        estimatedEffort: 'hours',
      };

      const text = generateIssueEmbeddingText(issue);
      assert.ok(text.includes('Fix CSRF bug in auth flow'));
      assert.ok(text.includes('Required Skills: javascript, express'));
      assert.ok(text.includes('Labels: security, bug'));
      assert.ok(text.includes('Estimated Effort: hours'));
    });

    it('should index issue embeddings and store 768-dimensional vector', async () => {
      const mockIssueDoc = {
        _id: dummyIssueId,
        title: 'Test Issue',
        description: 'Test Description',
        requiredSkills: ['test'],
        save: async function () {
          return this;
        },
      };

      Issue.findById = async () => mockIssueDoc;

      const indexed = await indexIssueEmbedding(dummyIssueId);
      assert.ok(Array.isArray(indexed.embedding));
      assert.equal(indexed.embedding.length, 768);
    });

    it('should execute semantic vector search and fall back gracefully if Atlas index is unconfigured', async () => {
      const queryVec = makeMockVector(1);
      const closeVec = makeMockVector(1.02);

      const mockIssues = [
        {
          _id: dummyIssueId,
          projectId: dummyProjectId,
          issueNumber: 1,
          title: 'Matching Issue',
          status: 'open',
          embedding: closeVec,
        },
      ];

      // Simulate MongoDB aggregate throwing code 40324 (no $vectorSearch in standalone mongo)
      const originalAggregate = Issue.aggregate;
      Issue.aggregate = async () => {
        const err = new Error('Unrecognized pipeline stage $vectorSearch');
        err.code = 40324;
        throw err;
      };

      Issue.find = () => mockQuery(mockIssues);

      try {
        const results = await searchSimilarIssues({
          projectId: dummyProjectId,
          queryVector: queryVec,
          limit: 1,
          status: 'open',
        });

        assert.equal(results.length, 1);
        assert.equal(results[0].matchingMethod, 'semantic_vector_search_fallback');
        assert.ok(results[0].score > 0);
      } finally {
        Issue.aggregate = originalAggregate;
      }
    });

    it('should report deterministic_fallback mode accurately when semantic search is unavailable', async () => {
      Project.find = () => mockQuery([{ _id: dummyProjectId, name: 'Project A', approvalStatus: 'approved', visibility: 'public' }]);
      Issue.find = () =>
        mockQuery([
          {
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 1,
            title: 'Simple task',
            status: 'open',
            estimatedEffort: 'weekend',
          },
        ]);

      // Cause embedding generation to fail to trigger fallback
      setEmbeddingGenerator(async () => {
        throw new Error('Ollama offline');
      });

      const candidates = await findIssues({ query: 'Find weekend task' }, { userId: dummyContributorId, userRole: 'contributor' });
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].matchingMethod, 'deterministic_fallback');
    });
  });

  // =========================================================================
  // 3. AGENT WORKFLOW ORCHESTRATION (runOnboardingAgent)
  // =========================================================================
  describe('3. Agent Workflow Orchestration (runOnboardingAgent)', () => {
    it('should execute full workflow for "Find a task I can start this weekend" and return grounded starter plan', async () => {
      Project.find = () =>
        mockQuery([
          { _id: dummyProjectId, name: 'Open Web Project', approvalStatus: 'approved', visibility: 'public' },
        ]);

      Project.findById = () =>
        mockQuery({
          _id: dummyProjectId,
          name: 'Open Web Project',
          approvalStatus: 'approved',
          visibility: 'public',
        });

      Issue.find = () =>
        mockQuery([
          {
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 77,
            title: 'Implement unit tests for login controller',
            description: 'Write Supertest cases for auth endpoints.',
            requiredSkills: ['javascript', 'node.js'],
            estimatedEffort: 'weekend',
            status: 'open',
            prerequisites: ['Node v20+'],
            setupSteps: ['npm install', 'npm test'],
          },
        ]);

      Issue.findById = () =>
        mockQuery({
          _id: dummyIssueId,
          projectId: dummyProjectId,
          issueNumber: 77,
          title: 'Implement unit tests for login controller',
          requiredSkills: ['javascript', 'node.js'],
          prerequisites: ['Node v20+'],
          setupSteps: ['npm install', 'npm test'],
          status: 'open',
          assignedContributorId: null,
        });

      Snapshot.findOne = () =>
        mockQuery({
          _id: dummySnapshotId,
          version: 'v1.0.0',
          isStale: false,
        });

      Chunk.find = () =>
        mockQuery([
          {
            text: 'Run tests using npm test.',
            metadata: {
              filePath: 'README.md',
              sectionTitle: 'Testing',
              snapshotVersion: 'v1.0.0',
            },
          },
        ]);

      const toolCalls = [];
      const onTool = async (record) => toolCalls.push(record.toolName);

      const result = await runOnboardingAgent(
        { query: 'Find a task I can start this weekend', availableHours: 12 },
        { userId: dummyContributorId, userRole: 'contributor' },
        onTool
      );

      assert.equal(result.recommendationFound, true);
      assert.equal(result.recommendedIssue.issueNumber, 77);
      assert.ok(result.starterPlan.summary);
      assert.equal(result.starterPlan.suggestedInitialSteps.length, 4);
      assert.ok(result.disclaimer.includes('does NOT reserve'));

      // Verify bounded tool invocation sequence: findIssues -> inspectPrerequisites -> checkIssueAvailability
      assert.ok(toolCalls.includes('findIssues'));
      assert.ok(toolCalls.includes('inspectPrerequisites'));
      assert.ok(toolCalls.includes('checkIssueAvailability'));
    });

    it('should recheck candidate availability and switch to alternative if top candidate is taken', async () => {
      Project.find = () =>
        mockQuery([
          { _id: dummyProjectId, name: 'Open Web Project', approvalStatus: 'approved', visibility: 'public' },
        ]);

      Project.findById = () =>
        mockQuery({
          _id: dummyProjectId,
          name: 'Open Web Project',
          approvalStatus: 'approved',
          visibility: 'public',
        });

      const issue1 = {
        _id: dummyIssueId,
        projectId: dummyProjectId,
        issueNumber: 1,
        title: 'Top Issue (Taken)',
        requiredSkills: ['javascript'],
        estimatedEffort: 'weekend',
        status: 'taken', // TAKEN!
        assignedContributorId: dummyMaintainerId,
      };

      const issue2 = {
        _id: dummyIssue2Id,
        projectId: dummyProjectId,
        issueNumber: 2,
        title: 'Alternative Issue (Open)',
        requiredSkills: ['javascript'],
        estimatedEffort: 'weekend',
        status: 'open', // OPEN!
        assignedContributorId: null,
      };

      Issue.find = () => mockQuery([issue1, issue2]);

      Issue.findById = (id) => {
        if (id.toString() === dummyIssueId.toString()) {
          return mockQuery(issue1);
        }
        return mockQuery(issue2);
      };

      Snapshot.findOne = () =>
        mockQuery({
          _id: dummySnapshotId,
          version: 'v1.0.0',
          isStale: false,
        });

      Chunk.find = () => mockQuery([]);

      const result = await runOnboardingAgent(
        { query: 'Find a task I can start this weekend' },
        { userId: dummyContributorId, userRole: 'contributor' }
      );

      assert.equal(result.recommendationFound, true);
      // Must have selected Alternative Issue #2 because Issue #1 was taken!
      assert.equal(result.recommendedIssue.issueNumber, 2);
    });

    it('should never automatically create an approved ContributionPlan during agent execution', async () => {
      let planCreated = false;
      const originalCreate = ContributionPlan.create;
      ContributionPlan.create = async () => {
        planCreated = true;
      };

      Project.find = () => mockQuery([{ _id: dummyProjectId, name: 'P1', approvalStatus: 'approved', visibility: 'public' }]);
      Project.findById = () => mockQuery({ _id: dummyProjectId, name: 'P1', approvalStatus: 'approved', visibility: 'public' });
      Issue.find = () => mockQuery([{ _id: dummyIssueId, projectId: dummyProjectId, issueNumber: 5, status: 'open', estimatedEffort: 'weekend' }]);
      Issue.findById = () => mockQuery({ _id: dummyIssueId, projectId: dummyProjectId, issueNumber: 5, status: 'open' });
      Snapshot.findOne = () => mockQuery(null);
      Chunk.find = () => mockQuery([]);

      try {
        await runOnboardingAgent(
          { query: 'Find a task' },
          { userId: dummyContributorId, userRole: 'contributor' }
        );
        assert.equal(planCreated, false, 'Agent must NEVER create a ContributionPlan document automatically');
      } finally {
        ContributionPlan.create = originalCreate;
      }
    });

    it('should safely record AgentRun status as failed when an unrecoverable error occurs', async () => {
      let savedStatus = null;
      const originalSave = AgentRun.prototype.save;
      AgentRun.prototype.save = async function () {
        savedStatus = this.status;
        return this;
      };

      Project.find = () => {
        throw new Error('Fatal database disk failure');
      };

      try {
        await assert.rejects(
          () =>
            executeOnboardingAgent({
              query: 'Find an issue',
              userId: dummyContributorId,
              userRole: 'contributor',
            }),
          /Fatal database disk failure/
        );

        assert.equal(savedStatus, 'failed', 'AgentRun must be finalized with status: failed on error');
      } finally {
        AgentRun.prototype.save = originalSave;
      }
    });
  });

  // =========================================================================
  // 4. API ROUTE, AUTHENTICATION & SECURITY BOUNDARIES (POST /api/onboarding-agent)
  // =========================================================================
  describe('4. API Route, Authentication & Security Boundaries (POST /api/onboarding-agent)', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const csrfRes = await request(app).get('/api/auth/csrf');
      const cookie = csrfRes.headers['set-cookie'];
      const csrfToken = csrfRes.body.data.csrfToken;

      const res = await request(app)
        .post('/api/onboarding-agent')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ query: 'Find a task for this weekend' });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('should reject requests missing CSRF token with 403 CSRF_INVALID', async () => {
      const agent = request.agent(app);
      await agent.post('/api/test-session').send({
        userId: dummyContributorId.toString(),
      });

      const res = await agent
        .post('/api/onboarding-agent')
        .send({ query: 'Find a task for this weekend' });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CSRF_INVALID');
    });

    it('should reject invalid input body (query too short < 3 chars) with 400 Bad Request', async () => {
      const { agent, csrfToken } = await createAuthSession(mockContributor);

      const res = await agent
        .post('/api/onboarding-agent')
        .set('X-CSRF-Token', csrfToken)
        .send({ query: 'hi' }); // < 3 characters

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('should prevent contributor from accessing private project issues with 403 FORBIDDEN', async () => {
      Project.findById = () =>
        mockQuery({
          _id: dummyPrivateProjectId,
          name: 'Private Enterprise Repository',
          approvalStatus: 'approved',
          visibility: 'private',
          ownerId: dummyMaintainerId,
        });

      MaintainerGrant.findOne = () => mockQuery(null);

      const { agent, csrfToken } = await createAuthSession(mockContributor);

      const res = await agent
        .post('/api/onboarding-agent')
        .set('X-CSRF-Token', csrfToken)
        .send({
          query: 'Find an issue in this private project',
          projectId: dummyPrivateProjectId.toString(),
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('should deny moderator access to private project data if moderator holds no maintainer grant', async () => {
      Project.findById = () =>
        mockQuery({
          _id: dummyPrivateProjectId,
          name: 'Private Enterprise Repository',
          approvalStatus: 'approved',
          visibility: 'private',
          ownerId: dummyMaintainerId,
        });

      MaintainerGrant.findOne = () => mockQuery(null);
      User.findById = () => mockQuery(mockModerator);

      const { agent, csrfToken } = await createAuthSession(mockModerator);

      const res = await agent
        .post('/api/onboarding-agent')
        .set('X-CSRF-Token', csrfToken)
        .send({
          query: 'Inspect issues in private project',
          projectId: dummyPrivateProjectId.toString(),
        });

      // Platform moderator does NOT automatically inherit project-scoped maintainer authority
      assert.equal(res.status, 403);
    });

    it('should successfully return 200 OK with recommendation for authenticated contributor', async () => {
      Project.find = () =>
        mockQuery([
          { _id: dummyProjectId, name: 'Open Web Project', approvalStatus: 'approved', visibility: 'public' },
        ]);

      Project.findById = () =>
        mockQuery({
          _id: dummyProjectId,
          name: 'Open Web Project',
          approvalStatus: 'approved',
          visibility: 'public',
        });

      Issue.find = () =>
        mockQuery([
          {
            _id: dummyIssueId,
            projectId: dummyProjectId,
            issueNumber: 88,
            title: 'Improve test coverage for auth routes',
            description: 'Write integration test cases.',
            requiredSkills: ['javascript', 'react'],
            estimatedEffort: 'weekend',
            status: 'open',
          },
        ]);

      Issue.findById = () =>
        mockQuery({
          _id: dummyIssueId,
          projectId: dummyProjectId,
          issueNumber: 88,
          title: 'Improve test coverage for auth routes',
          requiredSkills: ['javascript', 'react'],
          status: 'open',
        });

      Snapshot.findOne = () =>
        mockQuery({
          _id: dummySnapshotId,
          version: 'v1.0.0',
          isStale: false,
        });

      Chunk.find = () => mockQuery([]);

      const { agent, csrfToken } = await createAuthSession(mockContributor);

      const res = await agent
        .post('/api/onboarding-agent')
        .set('X-CSRF-Token', csrfToken)
        .send({
          query: 'Find a task I can start this weekend',
          availableHours: 10,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.agentRunId);
      assert.equal(res.body.data.recommendationFound, true);
      assert.equal(res.body.data.recommendedIssue.issueNumber, 88);
      assert.ok(res.body.data.starterPlan);
      assert.ok(res.body.data.disclaimer.includes('does NOT reserve'));
    });
  });
});
