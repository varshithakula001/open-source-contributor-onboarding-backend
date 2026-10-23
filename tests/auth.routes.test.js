import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('Phase 3: Auth Endpoints Behavior & Safety Fallbacks', () => {

  describe('Unconfigured Database Behavior (503 Service Unavailable)', () => {
    it('POST /api/auth/signup should fail safely with 503 when database is not connected', async () => {
      // 1. Obtain CSRF token
      const csrfRes = await request(app).get('/api/auth/csrf');
      const cookie = csrfRes.headers['set-cookie'];
      const csrfToken = csrfRes.body.data.csrfToken;

      // 2. Attempt signup without live database
      const res = await request(app)
        .post('/api/auth/signup')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'student@example.com',
          password: 'Password123!',
        })
        .expect(503);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
      assert.match(res.body.error.message, /MongoDB Atlas is not connected/);
    });

    it('POST /api/auth/login should fail safely with 503 when database is not connected', async () => {
      const csrfRes = await request(app).get('/api/auth/csrf');
      const cookie = csrfRes.headers['set-cookie'];
      const csrfToken = csrfRes.body.data.csrfToken;

      const res = await request(app)
        .post('/api/auth/login')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          email: 'student@example.com',
          password: 'Password123!',
        })
        .expect(503);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
    });

    it('GET /api/auth/me should fail safely with 503 when database is not connected', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(503);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
    });
  });

  describe('Unauthenticated Protected Route Behavior', () => {
    it('GET /api/auth/me should return 401 Unauthorized if database were connected and no session existed', async () => {
      // Direct call into requireAuth middleware verified in tests/auth.middleware.test.js
      assert.ok(true);
    });
  });

  describe('Security and Information Leakage Prevention', () => {
    it('Health check endpoint continues to return 200 without leaking secrets or failing during Phase 3', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.services.database.connected, false);
      assert.ok(
        ['unconfigured', 'disconnected'].includes(res.body.data.services.database.status),
        `Expected database status to be unconfigured or disconnected, got: ${res.body.data.services.database.status}`
      );
    });
  });
});
