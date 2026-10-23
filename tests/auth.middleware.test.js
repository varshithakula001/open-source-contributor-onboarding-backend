import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { requireAuth } from '../src/middlewares/auth.middleware.js';
import { requireRole, requireProjectMaintainer } from '../src/middlewares/rbac.middleware.js';
import { requireDatabase } from '../src/config/session.js';
import { createRateLimiter } from '../src/middlewares/rateLimiter.middleware.js';
import { User } from '../src/models/User.js';
import { MaintainerGrant } from '../src/models/MaintainerGrant.js';
import { Project } from '../src/models/Project.js';
import request from 'supertest';
import express from 'express';

describe('Phase 3: Authentication and RBAC Middleware', () => {

  describe('requireAuth Middleware', () => {
    it('should return 401 Unauthorized when session or userId is absent', async () => {
      const req = { session: {} };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      await requireAuth(req, res, () => {});

      assert.equal(responseStatus, 401);
      assert.equal(responseBody.success, false);
      assert.equal(responseBody.error.code, 'UNAUTHORIZED');
    });

    it('should return 403 when user account is deactivated', async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const req = { session: { userId: dummyId.toString(), sessionVersion: 1 } };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      // Mock User.findById
      const originalFindById = User.findById;
      User.findById = async () => ({
        _id: dummyId,
        isActive: false,
        emailVerified: true,
        sessionVersion: 1,
      });

      try {
        await requireAuth(req, res, () => {});
        assert.equal(responseStatus, 403);
        assert.equal(responseBody.error.code, 'ACCOUNT_DEACTIVATED');
      } finally {
        User.findById = originalFindById;
      }
    });

    it('should return 403 when user email is not verified', async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const req = { session: { userId: dummyId.toString(), sessionVersion: 1 } };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const originalFindById = User.findById;
      User.findById = async () => ({
        _id: dummyId,
        isActive: true,
        emailVerified: false,
        sessionVersion: 1,
      });

      try {
        await requireAuth(req, res, () => {});
        assert.equal(responseStatus, 403);
        assert.equal(responseBody.error.code, 'EMAIL_NOT_VERIFIED');
      } finally {
        User.findById = originalFindById;
      }
    });

    it('should return 401 and destroy session when sessionVersion is revoked', async () => {
      const dummyId = new mongoose.Types.ObjectId();
      let sessionDestroyed = false;
      const req = {
        session: {
          userId: dummyId.toString(),
          sessionVersion: 1,
          destroy: (cb) => { sessionDestroyed = true; cb && cb(); },
        },
      };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const originalFindById = User.findById;
      User.findById = async () => ({
        _id: dummyId,
        isActive: true,
        emailVerified: true,
        sessionVersion: 2, // User has incremented sessionVersion (e.g. after password reset)
      });

      try {
        await requireAuth(req, res, () => {});
        assert.equal(responseStatus, 401);
        assert.equal(responseBody.error.code, 'SESSION_REVOKED');
        assert.equal(sessionDestroyed, true);
      } finally {
        User.findById = originalFindById;
      }
    });

    it('should attach safe user object and invoke next() when session is valid', async () => {
      const dummyId = new mongoose.Types.ObjectId();
      const req = { session: { userId: dummyId.toString(), sessionVersion: 1 } };
      let nextCalled = false;

      const originalFindById = User.findById;
      User.findById = async () => ({
        _id: dummyId,
        email: 'contributor@example.com',
        role: 'contributor',
        isActive: true,
        emailVerified: true,
        sessionVersion: 1,
        toSafeObject: () => ({
          _id: dummyId,
          email: 'contributor@example.com',
          role: 'contributor',
        }),
      });

      try {
        await requireAuth(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.ok(req.user);
        assert.equal(req.user.email, 'contributor@example.com');
      } finally {
        User.findById = originalFindById;
      }
    });
  });

  describe('requireRole Middleware', () => {
    it('should permit access when user holds an allowed role', () => {
      const req = { user: { role: 'maintainer' } };
      let nextCalled = false;

      const middleware = requireRole('maintainer', 'moderator');
      middleware(req, {}, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
    });

    it('should reject access with 403 Forbidden when user holds an insufficient role', () => {
      const req = { user: { role: 'contributor' } };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const middleware = requireRole('maintainer', 'moderator');
      middleware(req, res, () => {});

      assert.equal(responseStatus, 403);
      assert.equal(responseBody.error.code, 'FORBIDDEN');
    });
  });

  describe('requireProjectMaintainer Middleware (Project-Scoped Isolation)', () => {
    const dummyUserId = new mongoose.Types.ObjectId();
    const dummyProjectId = new mongoose.Types.ObjectId();

    it('should allow access if user has an active MaintainerGrant for the target project', async () => {
      const req = {
        user: { _id: dummyUserId },
        params: { id: dummyProjectId.toString() },
      };
      let nextCalled = false;

      const originalGrantFindOne = MaintainerGrant.findOne;
      MaintainerGrant.findOne = async () => ({
        _id: new mongoose.Types.ObjectId(),
        projectId: dummyProjectId,
        userId: dummyUserId,
        status: 'active',
      });

      try {
        const middleware = requireProjectMaintainer();
        await middleware(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.ok(req.maintainerGrant);
      } finally {
        MaintainerGrant.findOne = originalGrantFindOne;
      }
    });

    it('should allow access if user is the original creator/owner of the project', async () => {
      const req = {
        user: { _id: dummyUserId },
        params: { id: dummyProjectId.toString() },
      };
      let nextCalled = false;

      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      MaintainerGrant.findOne = async () => null; // No separate grant
      Project.findOne = async () => ({
        _id: dummyProjectId,
        ownerId: dummyUserId,
        name: 'My Owned Project',
      });

      try {
        const middleware = requireProjectMaintainer();
        await middleware(req, {}, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.ok(req.project);
      } finally {
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });

    it('should reject access with 403 if user lacks a grant and does not own the project', async () => {
      const req = {
        user: { _id: dummyUserId },
        params: { id: dummyProjectId.toString() },
      };
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const originalGrantFindOne = MaintainerGrant.findOne;
      const originalProjectFindOne = Project.findOne;

      MaintainerGrant.findOne = async () => null;
      Project.findOne = async () => null;

      try {
        const middleware = requireProjectMaintainer();
        await middleware(req, res, () => {});
        assert.equal(responseStatus, 403);
        assert.equal(responseBody.error.code, 'FORBIDDEN_NOT_MAINTAINER');
      } finally {
        MaintainerGrant.findOne = originalGrantFindOne;
        Project.findOne = originalProjectFindOne;
      }
    });
  });

  describe('requireDatabase Middleware', () => {
    it('should return 503 Service Unavailable when MongoDB is not connected', () => {
      // In current testing setup, mongoose.connection.readyState is 0 (disconnected)
      let responseStatus = null;
      let responseBody = null;

      const res = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      requireDatabase({}, res, () => {});

      assert.equal(responseStatus, 503);
      assert.equal(responseBody.error.code, 'DATABASE_UNAVAILABLE');
    });
  });

  describe('Rate Limiter Behavior', () => {
    it('should return 429 Too Many Requests when rate limit threshold is exceeded', async () => {
      const testApp = express();
      const testLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 2,
        _enableInTest: true,
      });

      testApp.get('/test-rate-limit', testLimiter, (req, res) => {
        res.status(200).json({ success: true });
      });

      // Request 1: OK
      const res1 = await request(testApp).get('/test-rate-limit');
      assert.equal(res1.status, 200);

      // Request 2: OK
      const res2 = await request(testApp).get('/test-rate-limit');
      assert.equal(res2.status, 200);

      // Request 3: Blocked by rate limiter (429)
      const res3 = await request(testApp).get('/test-rate-limit');
      assert.equal(res3.status, 429);
      assert.equal(res3.body.success, false);
      assert.equal(res3.body.error.code, 'TOO_MANY_REQUESTS');
    });
  });
});
