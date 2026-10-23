import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('Phase 3: CSRF Protection & Token Exchange', () => {

  it('GET /api/auth/csrf should issue a valid CSRF token and set session cookie', async () => {
    const res = await request(app)
      .get('/api/auth/csrf')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data.csrfToken, 'Response must include csrfToken');
    assert.equal(typeof res.body.data.csrfToken, 'string');
    assert.ok(res.body.data.csrfToken.length > 10);

    // Verify session cookie was set
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Must issue session cookie');
    assert.ok(cookies.some((c) => c.startsWith('osco.sid=')), 'Cookie name must be osco.sid');
  });

  it('State-changing endpoints should reject requests missing CSRF token with 403 CSRF_INVALID', async () => {
    // Calling POST /api/auth/logout without CSRF token
    const res = await request(app)
      .post('/api/auth/logout')
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CSRF_INVALID');
    assert.match(res.body.error.message, /Invalid or missing CSRF token/);
  });

  it('State-changing endpoints should reject requests with an invalid CSRF token with 403 CSRF_INVALID', async () => {
    // 1. Obtain a valid session cookie
    const csrfRes = await request(app).get('/api/auth/csrf');
    const cookie = csrfRes.headers['set-cookie'];

    // 2. Submit with an invalid token
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', 'completely-bogus-token-value')
      .expect(403);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CSRF_INVALID');
  });

  it('State-changing endpoints should successfully accept a matching CSRF token and session', async () => {
    // 1. Obtain real session cookie and matching CSRF token
    const csrfRes = await request(app).get('/api/auth/csrf');
    const cookie = csrfRes.headers['set-cookie'];
    const validToken = csrfRes.body.data.csrfToken;

    // 2. Submit request with the valid cookie and X-CSRF-Token header
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', validToken)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.match(res.body.message, /Logged out successfully/);
  });
});
