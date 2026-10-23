import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { Project } from '../src/models/Project.js';
import { Issue } from '../src/models/Issue.js';
import { Interest } from '../src/models/Interest.js';
import { ContributionPlan } from '../src/models/ContributionPlan.js';
import { Review } from '../src/models/Review.js';
import { Snapshot } from '../src/models/Snapshot.js';
import { Document } from '../src/models/Document.js';
import { MaintainerGrant } from '../src/models/MaintainerGrant.js';
import { User } from '../src/models/User.js';
import { setSimulatedDatabaseConnected } from '../src/config/session.js';

describe('Phase 4: Core Business APIs Test Suite', () => {
  // Common Mock Identifiers
  const dummyContributorId = new mongoose.Types.ObjectId();
  const dummyMaintainerId = new mongoose.Types.ObjectId();
  const dummyModeratorId = new mongoose.Types.ObjectId();
  const dummyOtherUserId = new mongoose.Types.ObjectId();
  const dummyProjectId = new mongoose.Types.ObjectId();
  const dummySnapshotId = new mongoose.Types.ObjectId();
  const dummyIssueId = new mongoose.Types.ObjectId();
  const dummyPlanId = new mongoose.Types.ObjectId();

  // Helper to establish an authenticated supertest session with CSRF token
  async function createAuthSession(userRecord) {
    const agent = request.agent(app);
    // Use the test-only endpoint to set session state
    await agent.post('/api/test-session').send({
      userId: userRecord._id.toString(),
      sessionVersion: userRecord.sessionVersion || 1,
    });
    // Obtain valid CSRF token
    const csrfRes = await agent.get('/api/auth/csrf');
    const csrfToken = csrfRes.body.data.csrfToken;

    return {
      agent,
      csrfToken,
    };
  }

  // Setup default simulated connected database state for business tests
  beforeEach(() => {
    setSimulatedDatabaseConnected(true);
  });

  afterEach(() => {
    setSimulatedDatabaseConnected(null);
  });

  // =========================================================================
  // 1. PUBLIC PROJECT DISCOVERY APIs
  // =========================================================================
  describe('1. Public Project Discovery (GET /api/projects & GET /api/projects/:id/issues)', () => {
    it('1. GET /api/projects should return only approved public projects and exclude sensitive fields', async () => {
      const originalFind = Project.find;
      const originalCount = Project.countDocuments;

      Project.countDocuments = async () => 1;
      Project.find = () => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    _id: dummyProjectId,
                    name: 'Public AI Tools',
                    slug: 'public-ai-tools',
                    description: 'Approved public open source tools.',
                    repositoryUrl: 'https://github.com/org/ai-tools',
                    topics: ['ai', 'nlp'],
                    languages: ['javascript', 'python'],
                    currentSnapshotVersion: 'v1.0.0',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
              }),
            }),
          }),
        }),
      });

      try {
        const res = await request(app)
          .get('/api/projects?page=1&limit=10')
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(res.body.data.projects.length, 1);
        const p = res.body.data.projects[0];
        assert.equal(p.name, 'Public AI Tools');
        assert.equal(p.slug, 'public-ai-tools');
        // Must exclude sensitive moderation & owner info
        assert.equal(p.ownerId, undefined);
        assert.equal(p.approvalInfo, undefined);
      } finally {
        Project.find = originalFind;
        Project.countDocuments = originalCount;
      }
    });

    it('2 & 3. GET /api/projects should exclude pending and rejected projects', async () => {
      const originalFind = Project.find;
      const originalCount = Project.countDocuments;

      let capturedQuery = null;
      Project.countDocuments = async (q) => {
        capturedQuery = q;
        return 0;
      };
      Project.find = (q) => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }),
      });

      try {
        const res = await request(app).get('/api/projects').expect(200);
        assert.equal(res.body.success, true);
        assert.equal(capturedQuery.approvalStatus, 'approved');
        assert.equal(capturedQuery.visibility, 'public');
      } finally {
        Project.find = originalFind;
        Project.countDocuments = originalCount;
      }
    });

    it('4. GET /api/projects should exclude approved private projects', async () => {
      const originalFind = Project.find;
      const originalCount = Project.countDocuments;

      let capturedQuery = null;
      Project.countDocuments = async (q) => {
        capturedQuery = q;
        return 0;
      };
      Project.find = () => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }),
      });

      try {
        await request(app).get('/api/projects').expect(200);
        assert.equal(capturedQuery.visibility, 'public');
      } finally {
        Project.find = originalFind;
        Project.countDocuments = originalCount;
      }
    });

    it('5. GET /api/projects/:id/issues should return only eligible open issues (excluding taken/closed)', async () => {
      const originalProjectFindById = Project.findById;
      const originalIssueFind = Issue.find;
      const originalIssueCount = Issue.countDocuments;

      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            name: 'Public AI Tools',
            slug: 'public-ai-tools',
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });

      let capturedIssueQuery = null;
      Issue.countDocuments = async (q) => {
        capturedIssueQuery = q;
        return 1;
      };
      Issue.find = (q) => {
        capturedIssueQuery = q;
        return {
          select: () => ({
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  lean: async () => [
                    {
                      _id: dummyIssueId,
                      issueNumber: 1,
                      title: 'Setup Documentation',
                      description: 'Configure local testing setup.',
                      status: 'open',
                      requiredSkills: ['node'],
                      estimatedEffort: 'weekend',
                    },
                  ],
                }),
              }),
            }),
          }),
        };
      };

      try {
        const res = await request(app)
          .get(`/api/projects/${dummyProjectId.toString()}/issues`)
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(capturedIssueQuery.status, 'open');
        assert.equal(res.body.data.issues.length, 1);
        assert.equal(res.body.data.issues[0].status, 'open');
      } finally {
        Project.findById = originalProjectFindById;
        Issue.find = originalIssueFind;
        Issue.countDocuments = originalIssueCount;
      }
    });

    it('6. GET /api/projects/:id/issues should reject invalid ObjectId format with 400', async () => {
      const res = await request(app)
        .get('/api/projects/not-a-valid-hex-objectid/issues')
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_PARAMETERS');
    });

    it('6b. GET /api/projects/:id/issues should return 404 if project is private, unapproved, or missing', async () => {
      const originalProjectFindById = Project.findById;
      // Project is approved but private
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'private',
          }),
        }),
      });

      try {
        const res = await request(app)
          .get(`/api/projects/${dummyProjectId.toString()}/issues`)
          .expect(404);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'PROJECT_NOT_FOUND');
      } finally {
        Project.findById = originalProjectFindById;
      }
    });

    it('7. GET /api/projects query filters and pagination should reject invalid values', async () => {
      const res = await request(app)
        .get('/api/projects?page=-1&limit=999')
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_QUERY');
    });
  });

  // =========================================================================
  // 2. CONTRIBUTOR ISSUE-INTEREST API
  // =========================================================================
  describe('2. Contributor Issue-Interest API (POST /api/issues/:id/interest)', () => {
    const mockContributor = {
      _id: dummyContributorId,
      role: 'contributor',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role, emailVerified: true, isActive: true };
      },
    };

    it('8. POST /api/issues/:id/interest should reject unauthenticated requests with 401', async () => {
      const csrfRes = await request(app).get('/api/auth/csrf');
      const cookie = csrfRes.headers['set-cookie'];
      const csrfToken = csrfRes.body.data.csrfToken;

      const res = await request(app)
        .post(`/api/issues/${dummyIssueId.toString()}/interest`)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(401);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('9. POST /api/issues/:id/interest should reject non-contributor roles with 403', async () => {
      const mockMaintainer = {
        _id: dummyMaintainerId,
        role: 'maintainer',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      User.findById = async () => mockMaintainer;

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({ declaredAvailableHours: 10 })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('10. POST /api/issues/:id/interest should reject invalid interest payload (zero hours) with 400', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockContributor;

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({ declaredAvailableHours: 0 })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('11. POST /api/issues/:id/interest should reject interest on unapproved or private project with 404', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockContributor;
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: dummyProjectId,
        status: 'open',
      });
      // Project is unapproved
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'pending',
            visibility: 'public',
          }),
        }),
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({ declaredAvailableHours: 15 })
          .expect(404);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ISSUE_NOT_FOUND');
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        Project.findById = originalProjectFindById;
      }
    });

    it('12. POST /api/issues/:id/interest should reject taken or closed issues with 400', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockContributor;
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: dummyProjectId,
        status: 'taken', // taken issue
      });
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({ declaredAvailableHours: 12 })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'ISSUE_NOT_AVAILABLE');
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        Project.findById = originalProjectFindById;
      }
    });

    it('13. POST /api/issues/:id/interest should return 409 conflict for duplicate active interest', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalProjectFindById = Project.findById;
      const originalInterestFindOne = Interest.findOne;

      User.findById = async () => mockContributor;
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: dummyProjectId,
        status: 'open',
      });
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });
      // Active interest already exists
      Interest.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        status: 'active',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({ declaredAvailableHours: 10 })
          .expect(409);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'INTEREST_ALREADY_EXISTS');
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        Project.findById = originalProjectFindById;
        Interest.findOne = originalInterestFindOne;
      }
    });

    it('14. POST /api/issues/:id/interest should use authenticated user ID and create interest without changing issue status', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalProjectFindById = Project.findById;
      const originalInterestFindOne = Interest.findOne;
      const originalInterestCreate = Interest.create;

      User.findById = async () => mockContributor;
      const mockIssue = {
        _id: dummyIssueId,
        projectId: dummyProjectId,
        status: 'open',
      };
      Issue.findById = async () => mockIssue;
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });
      Interest.findOne = async () => null;

      let createdPayload = null;
      Interest.create = async (payload) => {
        createdPayload = payload;
        return {
          _id: new mongoose.Types.ObjectId(),
          ...payload,
        };
      };

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/issues/${dummyIssueId.toString()}/interest`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            declaredAvailableHours: 20,
            message: 'I have experience in Node.js and would love to help.',
            contributorId: dummyOtherUserId.toString(), // Client-forged ID should be ignored
          })
          .expect(201);

        assert.equal(res.body.success, true);
        assert.equal(createdPayload.contributorId.toString(), mockContributor._id.toString());
        assert.equal(createdPayload.declaredAvailableHours, 20);
        // Issue status must remain open (not taken)
        assert.equal(mockIssue.status, 'open');
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        Project.findById = originalProjectFindById;
        Interest.findOne = originalInterestFindOne;
        Interest.create = originalInterestCreate;
      }
    });
  });

  // =========================================================================
  // 3. CONTRIBUTION-PLAN APIs
  // =========================================================================
  describe('3. Contribution-Plan APIs (POST & GET /api/contribution-plans)', () => {
    const mockContributor = {
      _id: dummyContributorId,
      role: 'contributor',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role, emailVerified: true, isActive: true };
      },
    };

    const validPlanPayload = {
      projectId: dummyProjectId.toString(),
      issueId: dummyIssueId.toString(),
      snapshotId: dummySnapshotId.toString(),
      planObjective: 'Implement complete unit test coverage for health endpoints.',
      proposedApproach: 'Follow the test harness patterns and assert standard JSON structures.',
      orderedImplementationSteps: [
        {
          stepNumber: 1,
          description: 'Review existing test file structure and assertions.',
          targetFiles: ['tests/app.test.js'],
        },
      ],
      supportingEvidence: [
        {
          snapshotVersion: 'v1.0.0',
          filePath: 'README.md',
          quoteOrExplanation: 'Refer to testing commands in documentation.',
        },
      ],
    };

    it('15 & 17. POST /api/contribution-plans should successfully submit plan in "submitted" status', async () => {
      const originalUserFindById = User.findById;
      const originalProjectFindById = Project.findById;
      const originalIssueFindById = Issue.findById;
      const originalSnapshotFindById = Snapshot.findById;
      const originalPlanCreate = ContributionPlan.create;

      User.findById = async () => mockContributor;
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: dummyProjectId,
        status: 'open',
      });
      Snapshot.findById = async () => ({
        _id: dummySnapshotId,
        projectId: dummyProjectId,
      });

      let createdPlanData = null;
      ContributionPlan.create = async (data) => {
        createdPlanData = data;
        return {
          _id: dummyPlanId,
          ...data,
        };
      };

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post('/api/contribution-plans')
          .set('X-CSRF-Token', csrfToken)
          .send(validPlanPayload)
          .expect(201);

        assert.equal(res.body.success, true);
        assert.equal(createdPlanData.status, 'submitted');
        assert.ok(createdPlanData.submittedAt);
      } finally {
        User.findById = originalUserFindById;
        Project.findById = originalProjectFindById;
        Issue.findById = originalIssueFindById;
        Snapshot.findById = originalSnapshotFindById;
        ContributionPlan.create = originalPlanCreate;
      }
    });

    it('16. POST /api/contribution-plans should reject invalid payload (empty steps) with 400', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockContributor;

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post('/api/contribution-plans')
          .set('X-CSRF-Token', csrfToken)
          .send({
            ...validPlanPayload,
            orderedImplementationSteps: [], // Empty steps
          })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('18. POST /api/contribution-plans should reject or ignore client-forged contributorId', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockContributor;

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        // Attempting to inject contributorId in body
        const res = await agent
          .post('/api/contribution-plans')
          .set('X-CSRF-Token', csrfToken)
          .send({
            ...validPlanPayload,
            contributorId: dummyOtherUserId.toString(),
          })
          .expect(400); // Schema is strict and rejects unrecognized fields

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('19. POST /api/contribution-plans should reject mismatched issue/project relationship with 400', async () => {
      const originalUserFindById = User.findById;
      const originalProjectFindById = Project.findById;
      const originalIssueFindById = Issue.findById;

      User.findById = async () => mockContributor;
      Project.findById = () => ({
        select: () => ({
          lean: async () => ({
            _id: dummyProjectId,
            approvalStatus: 'approved',
            visibility: 'public',
          }),
        }),
      });
      // Issue belongs to an unrelated project
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: new mongoose.Types.ObjectId(),
        status: 'open',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post('/api/contribution-plans')
          .set('X-CSRF-Token', csrfToken)
          .send(validPlanPayload)
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'INVALID_RELATIONSHIP');
      } finally {
        User.findById = originalUserFindById;
        Project.findById = originalProjectFindById;
        Issue.findById = originalIssueFindById;
      }
    });

    it('20. GET /api/contribution-plans/:id should allow the contributor/author to retrieve their own plan', async () => {
      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;

      User.findById = async () => mockContributor;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
        planObjective: 'My private plan',
        status: 'submitted',
      });

      try {
        const { agent } = await createAuthSession(mockContributor);
        const res = await agent
          .get(`/api/contribution-plans/${dummyPlanId.toString()}`)
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(res.body.data.plan.planObjective, 'My private plan');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
      }
    });

    it('21. GET /api/contribution-plans/:id should deny unrelated contributors with 403', async () => {
      const mockUnrelatedContributor = {
        _id: dummyOtherUserId,
        role: 'contributor',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      User.findById = async () => mockUnrelatedContributor;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId, // Belongs to dummyContributorId
        projectId: dummyProjectId,
      });
      MaintainerGrant.findOne = async () => null;
      Project.findOne = async () => null;

      try {
        const { agent } = await createAuthSession(mockUnrelatedContributor);
        const res = await agent
          .get(`/api/contribution-plans/${dummyPlanId.toString()}`)
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });

    it('22. GET /api/contribution-plans/:id should allow an authorized project maintainer to retrieve the plan', async () => {
      const mockMaintainer = {
        _id: dummyMaintainerId,
        role: 'maintainer',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;

      User.findById = async () => mockMaintainer;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
        planObjective: 'Contributor proposed changes',
      });
      // Maintainer has active grant for dummyProjectId
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      try {
        const { agent } = await createAuthSession(mockMaintainer);
        const res = await agent
          .get(`/api/contribution-plans/${dummyPlanId.toString()}`)
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(res.body.data.plan.planObjective, 'Contributor proposed changes');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
      }
    });

    it('23. GET /api/contribution-plans/:id should deny maintainers without a grant for that project with 403', async () => {
      const mockUnrelatedMaintainer = {
        _id: dummyOtherUserId,
        role: 'maintainer',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      User.findById = async () => mockUnrelatedMaintainer;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
      });
      MaintainerGrant.findOne = async () => null; // No grant for dummyProjectId
      Project.findOne = async () => null; // Not owner

      try {
        const { agent } = await createAuthSession(mockUnrelatedMaintainer);
        const res = await agent
          .get(`/api/contribution-plans/${dummyPlanId.toString()}`)
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });
  });

  // =========================================================================
  // 4. REVIEW INBOX & REVIEWS
  // =========================================================================
  describe('4. Review Inbox and Review Submission APIs', () => {
    const mockMaintainer = {
      _id: dummyMaintainerId,
      role: 'maintainer',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role, emailVerified: true, isActive: true };
      },
    };

    it('24 & 25. GET /api/projects/:id/contribution-plans should return plans only for authorized project maintainer', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalPlanFind = ContributionPlan.find;
      const originalPlanCount = ContributionPlan.countDocuments;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      let capturedPlanQuery = null;
      ContributionPlan.countDocuments = async (q) => {
        capturedPlanQuery = q;
        return 1;
      };
      ContributionPlan.find = (q) => {
        capturedPlanQuery = q;
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [
                  {
                    _id: dummyPlanId,
                    projectId: dummyProjectId,
                    planObjective: 'Review me please',
                    status: 'submitted',
                  },
                ],
              }),
            }),
          }),
        };
      };

      try {
        const { agent } = await createAuthSession(mockMaintainer);
        const res = await agent
          .get(`/api/projects/${dummyProjectId.toString()}/contribution-plans`)
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(capturedPlanQuery.projectId.toString(), dummyProjectId.toString());
        assert.equal(capturedPlanQuery.status, 'submitted');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        ContributionPlan.find = originalPlanFind;
        ContributionPlan.countDocuments = originalPlanCount;
      }
    });

    it('26. POST /api/contribution-plans/:id/review should reject short feedback with 400', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockMaintainer;

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/contribution-plans/${dummyPlanId.toString()}/review`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            decision: 'approved',
            feedback: 'short', // Less than 10 characters
          })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('27 & 28. POST /api/contribution-plans/:id/review should deny moderators without project grant with 403', async () => {
      const mockModerator = {
        _id: dummyModeratorId,
        role: 'moderator',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      User.findById = async () => mockModerator;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
        status: 'submitted',
      });
      // Moderator has NO project grant
      MaintainerGrant.findOne = async () => null;
      Project.findOne = async () => null;

      try {
        const { agent, csrfToken } = await createAuthSession(mockModerator);
        const res = await agent
          .post(`/api/contribution-plans/${dummyPlanId.toString()}/review`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            decision: 'approved',
            feedback: 'Looks good overall, ready for development.',
          })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN_NOT_MAINTAINER');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });

    it('29 & 30. POST /api/contribution-plans/:id/review should transition plan status and store reviewer identity', async () => {
      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalReviewCreate = Review.create;

      User.findById = async () => mockMaintainer;

      const mockPlan = {
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
        status: 'submitted',
        save: async function () {
          return this;
        },
      };

      ContributionPlan.findById = async () => mockPlan;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      let createdReviewData = null;
      Review.create = async (data) => {
        createdReviewData = data;
        return {
          _id: new mongoose.Types.ObjectId(),
          ...data,
        };
      };

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/contribution-plans/${dummyPlanId.toString()}/review`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            decision: 'request_changes',
            feedback: 'Please include additional test coverage for edge cases.',
          })
          .expect(201);

        assert.equal(res.body.success, true);
        assert.equal(res.body.data.planStatus, 'changes_requested');
        assert.equal(mockPlan.status, 'changes_requested');
        assert.equal(createdReviewData.reviewingMaintainerId.toString(), mockMaintainer._id.toString());
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Review.create = originalReviewCreate;
      }
    });

    it('31. POST /api/contribution-plans/:id/review should reject review on already approved plan with 400', async () => {
      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;

      User.findById = async () => mockMaintainer;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyContributorId,
        projectId: dummyProjectId,
        status: 'approved', // already approved
      });
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/contribution-plans/${dummyPlanId.toString()}/review`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            decision: 'rejected',
            feedback: 'Attempting to reject an already approved plan.',
          })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'INVALID_STATE_TRANSITION');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
      }
    });

    it('31b. POST /api/contribution-plans/:id/review should prevent contributor self-review with 403', async () => {
      const mockSelfContributor = {
        _id: dummyMaintainerId, // Same ID as contributorId
        role: 'maintainer',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      const originalPlanFindById = ContributionPlan.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;

      User.findById = async () => mockSelfContributor;
      ContributionPlan.findById = async () => ({
        _id: dummyPlanId,
        contributorId: dummyMaintainerId, // User is both author and maintainer!
        projectId: dummyProjectId,
        status: 'submitted',
      });
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockSelfContributor);
        const res = await agent
          .post(`/api/contribution-plans/${dummyPlanId.toString()}/review`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            decision: 'approved',
            feedback: 'Approving my own plan should be strictly forbidden.',
          })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'SELF_REVIEW_FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
        ContributionPlan.findById = originalPlanFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
      }
    });
  });

  // =========================================================================
  // 5. SNAPSHOT IMPORTS
  // =========================================================================
  describe('5. Snapshot Import API (POST /api/projects/:id/imports)', () => {
    const mockMaintainer = {
      _id: dummyMaintainerId,
      role: 'maintainer',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role };
      },
    };

    const validSnapshotPayload = {
      version: 'v1.1.0',
      importSource: 'github-release',
      documents: [
        {
          filePath: 'README.md',
          title: 'Project Readme',
          content: '# Project\nUntrusted markdown instructions.',
          docType: 'readme',
        },
      ],
      issues: [
        {
          issueNumber: 10,
          title: 'Initial Documentation Task',
          description: 'Document the repository architecture.',
          estimatedEffort: 'weekend',
        },
      ],
    };

    it('32. POST /api/projects/:id/imports should reject unauthenticated requests with 401', async () => {
      const csrfRes = await request(app).get('/api/auth/csrf');
      const cookie = csrfRes.headers['set-cookie'];
      const csrfToken = csrfRes.body.data.csrfToken;

      const res = await request(app)
        .post(`/api/projects/${dummyProjectId.toString()}/imports`)
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(401);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });

    it('33. POST /api/projects/:id/imports should reject contributors with 403', async () => {
      const mockContributor = {
        _id: dummyContributorId,
        role: 'contributor',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      User.findById = async () => mockContributor;

      try {
        const { agent, csrfToken } = await createAuthSession(mockContributor);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send(validSnapshotPayload)
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('34. POST /api/projects/:id/imports should deny maintainers without a project grant with 403', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => null; // No grant
      Project.findOne = async () => null; // Not owner

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send(validSnapshotPayload)
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN_NOT_MAINTAINER');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });

    it('35. POST /api/projects/:id/imports should reject duplicate file paths within import payload with 400', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });
      Project.findById = async () => ({ _id: dummyProjectId });

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            ...validSnapshotPayload,
            documents: [
              { filePath: 'docs/setup.md', title: 'Doc 1', content: 'abc' },
              { filePath: 'docs/setup.md', title: 'Doc 2', content: 'xyz' }, // Duplicate filePath
            ],
          })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findById = originalProjectFindById;
      }
    });

    it('36. POST /api/projects/:id/imports should reject duplicate snapshot versions with 409', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindById = Project.findById;
      const originalSnapshotFindOne = Snapshot.findOne;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });
      Project.findById = async () => ({ _id: dummyProjectId });
      // Existing snapshot with same version
      Snapshot.findOne = async () => ({
        _id: dummySnapshotId,
        version: 'v1.1.0',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send(validSnapshotPayload)
          .expect(409);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'SNAPSHOT_VERSION_EXISTS');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findById = originalProjectFindById;
        Snapshot.findOne = originalSnapshotFindOne;
      }
    });

    it('37. POST /api/projects/:id/imports should reject duplicate issue numbers within payload with 400', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });
      Project.findById = async () => ({ _id: dummyProjectId });

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            ...validSnapshotPayload,
            issues: [
              { issueNumber: 10, title: 'Task 1', description: 'Desc 1' },
              { issueNumber: 10, title: 'Task 2', description: 'Desc 2' }, // Duplicate issueNumber
            ],
          })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findById = originalProjectFindById;
      }
    });

    it('38, 39 & 40. POST /api/projects/:id/imports should safely persist documents as untrusted content', async () => {
      const originalUserFindById = User.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindById = Project.findById;
      const originalSnapshotFindOne = Snapshot.findOne;
      const originalIssueFind = Issue.find;
      const originalSnapshotCreate = Snapshot.create;
      const originalDocInsertMany = Document.insertMany;
      const originalIssueInsertMany = Issue.insertMany;
      const originalProjectUpdate = Project.findByIdAndUpdate;

      User.findById = async () => mockMaintainer;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });
      Project.findById = async () => ({ _id: dummyProjectId });
      Snapshot.findOne = async () => null; // No duplicate snapshot
      Issue.find = () => ({
        select: () => ({
          lean: async () => [], // No duplicate issues in DB
        }),
      });

      const mockSnapshotDoc = {
        _id: dummySnapshotId,
        projectId: dummyProjectId,
        version: 'v1.1.0',
        importStatus: 'importing',
        save: async function () {
          this.importStatus = 'imported';
          return this;
        },
      };

      Snapshot.create = async () => [mockSnapshotDoc];
      let insertedDocs = null;
      Document.insertMany = async (docs) => {
        insertedDocs = docs;
        return docs;
      };
      Issue.insertMany = async () => [];
      Project.findByIdAndUpdate = async () => ({});

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .post(`/api/projects/${dummyProjectId.toString()}/imports`)
          .set('X-CSRF-Token', csrfToken)
          .send(validSnapshotPayload)
          .expect(201);

        assert.equal(res.body.success, true);
        assert.equal(res.body.data.snapshot.importStatus, 'imported');
        assert.equal(res.body.data.importedDocumentsCount, 1);
        // Documents are stored as raw text, never interpreted or executed
        assert.equal(insertedDocs[0].content, '# Project\nUntrusted markdown instructions.');
      } finally {
        User.findById = originalUserFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findById = originalProjectFindById;
        Snapshot.findOne = originalSnapshotFindOne;
        Issue.find = originalIssueFind;
        Snapshot.create = originalSnapshotCreate;
        Document.insertMany = originalDocInsertMany;
        Issue.insertMany = originalIssueInsertMany;
        Project.findByIdAndUpdate = originalProjectUpdate;
      }
    });
  });

  // =========================================================================
  // 6. MAINTAINER ISSUE-MANAGEMENT API
  // =========================================================================
  describe('6. Maintainer Issue-Management API (PATCH /api/issues/:id)', () => {
    const mockMaintainer = {
      _id: dummyMaintainerId,
      role: 'maintainer',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role };
      },
    };

    it('41 & 43. PATCH /api/issues/:id should deny unauthorized maintainers with 403', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      User.findById = async () => mockMaintainer;
      Issue.findById = async () => ({
        _id: dummyIssueId,
        projectId: dummyProjectId,
      });
      MaintainerGrant.findOne = async () => null; // No grant for project
      Project.findOne = async () => null; // Not owner

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .patch(`/api/issues/${dummyIssueId.toString()}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ title: 'New Valid Title' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN_NOT_MAINTAINER');
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });

    it('42. PATCH /api/issues/:id should reject invalid issue status values with 400', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockMaintainer;

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .patch(`/api/issues/${dummyIssueId.toString()}`)
          .set('X-CSRF-Token', csrfToken)
          .send({ status: 'invalid_status_enum' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('44 & 45. PATCH /api/issues/:id should update mutable fields while protecting immutable fields', async () => {
      const originalUserFindById = User.findById;
      const originalIssueFindById = Issue.findById;
      const originalGrantFindOne = MaintainerGrant.findOne;

      User.findById = async () => mockMaintainer;

      const mockIssue = {
        _id: dummyIssueId,
        projectId: dummyProjectId,
        issueNumber: 42,
        title: 'Original Title',
        status: 'open',
        isStaleSetup: false,
        save: async function () {
          return this;
        },
      };

      Issue.findById = async () => mockIssue;
      MaintainerGrant.findOne = async () => ({
        projectId: dummyProjectId,
        userId: dummyMaintainerId,
        status: 'active',
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .patch(`/api/issues/${dummyIssueId.toString()}`)
          .set('X-CSRF-Token', csrfToken)
          .send({
            title: 'Updated Setup Guidance',
            status: 'closed',
            isStaleSetup: true,
            staleSetupNotes: 'Dependencies were updated in v2.0.',
          })
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(mockIssue.title, 'Updated Setup Guidance');
        assert.equal(mockIssue.status, 'closed');
        assert.equal(mockIssue.isStaleSetup, true);
        assert.equal(mockIssue.staleSetupNotes, 'Dependencies were updated in v2.0.');
        // Protected fields cannot change
        assert.equal(mockIssue.issueNumber, 42);
        assert.equal(mockIssue.projectId.toString(), dummyProjectId.toString());
      } finally {
        User.findById = originalUserFindById;
        Issue.findById = originalIssueFindById;
        MaintainerGrant.findOne = originalGrantFindOne;
      }
    });
  });

  // =========================================================================
  // 7. MODERATOR PROJECT-VERIFICATION API
  // =========================================================================
  describe('7. Moderator Project-Verification API (PATCH /api/projects/:id/verification)', () => {
    const mockModerator = {
      _id: dummyModeratorId,
      role: 'moderator',
      isActive: true,
      emailVerified: true,
      sessionVersion: 1,
      toSafeObject() {
        return { _id: this._id, role: this.role };
      },
    };

    it('46. PATCH /api/projects/:id/verification should allow only moderators (deny contributors and maintainers)', async () => {
      const mockMaintainer = {
        _id: dummyMaintainerId,
        role: 'maintainer',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject() {
          return { _id: this._id, role: this.role };
        },
      };

      const originalUserFindById = User.findById;
      User.findById = async () => mockMaintainer;

      try {
        const { agent, csrfToken } = await createAuthSession(mockMaintainer);
        const res = await agent
          .patch(`/api/projects/${dummyProjectId.toString()}/verification`)
          .set('X-CSRF-Token', csrfToken)
          .send({ verificationStatus: 'approved' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
      }
    });

    it('47. PATCH /api/projects/:id/verification should prevent moderators from verifying their own project', async () => {
      const originalUserFindById = User.findById;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockModerator;
      Project.findById = async () => ({
        _id: dummyProjectId,
        ownerId: dummyModeratorId, // Moderator owns this project!
      });

      try {
        const { agent, csrfToken } = await createAuthSession(mockModerator);
        const res = await agent
          .patch(`/api/projects/${dummyProjectId.toString()}/verification`)
          .set('X-CSRF-Token', csrfToken)
          .send({ verificationStatus: 'approved' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'SELF_VERIFICATION_FORBIDDEN');
      } finally {
        User.findById = originalUserFindById;
        Project.findById = originalProjectFindById;
      }
    });

    it('48 & 49. PATCH /api/projects/:id/verification should update approvalStatus while keeping private visibility private', async () => {
      const originalUserFindById = User.findById;
      const originalProjectFindById = Project.findById;

      User.findById = async () => mockModerator;

      const mockProject = {
        _id: dummyProjectId,
        name: 'Private Internal Project',
        slug: 'private-internal-project',
        ownerId: dummyOtherUserId,
        visibility: 'private', // Strictly private
        approvalStatus: 'pending',
        save: async function () {
          return this;
        },
      };

      Project.findById = async () => mockProject;

      try {
        const { agent, csrfToken } = await createAuthSession(mockModerator);
        const res = await agent
          .patch(`/api/projects/${dummyProjectId.toString()}/verification`)
          .set('X-CSRF-Token', csrfToken)
          .send({ verificationStatus: 'approved' })
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(mockProject.approvalStatus, 'approved');
        // Visibility MUST remain private!
        assert.equal(mockProject.visibility, 'private');
        assert.equal(mockProject.approvalInfo.approvedBy.toString(), mockModerator._id.toString());
      } finally {
        User.findById = originalUserFindById;
        Project.findById = originalProjectFindById;
      }
    });

    it('50. Project verification should require rejectionReason when rejecting', async () => {
      const originalUserFindById = User.findById;
      User.findById = async () => mockModerator;

      try {
        const { agent, csrfToken } = await createAuthSession(mockModerator);
        const res = await agent
          .patch(`/api/projects/${dummyProjectId.toString()}/verification`)
          .set('X-CSRF-Token', csrfToken)
          .send({ verificationStatus: 'rejected' }) // Missing required rejectionReason
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      } finally {
        User.findById = originalUserFindById;
      }
    });
  });

  // =========================================================================
  // 8. APPLICATION RELIABILITY & SECURITY
  // =========================================================================
  describe('8. Application Reliability, Fallbacks & CSRF Protection', () => {
    it('51. Business endpoints should safely fail with 503 DATABASE_UNAVAILABLE when database is disconnected', async () => {
      setSimulatedDatabaseConnected(false);

      const res = await request(app)
        .get('/api/projects')
        .expect(503);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
    });

    it('52. State-changing business endpoints should reject missing CSRF token with 403 CSRF_INVALID', async () => {
      const res = await request(app)
        .post('/api/contribution-plans')
        .send({})
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'CSRF_INVALID');
    });
  });
});
