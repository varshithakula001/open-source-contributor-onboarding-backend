import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { getDatabaseStatus } from '../src/config/db.js';

describe('Phase 1: Basic Application & Health Endpoint Tests', () => {

  describe('GET /api/health', () => {
    it('should return 200 OK with accurate application and database status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.equal(response.body.success, true);
      assert.ok(response.body.data);
      assert.equal(response.body.data.status, 'healthy');
      assert.ok(response.body.data.timestamp);
      assert.equal(typeof response.body.data.uptimeSeconds, 'number');

      // Check database status reporting
      const dbService = response.body.data.services.database;
      assert.ok(dbService, 'Database service status must be present');
      // When MONGODB_URI is not set, it should accurately report 'unconfigured' or 'disconnected'
      assert.ok(
        ['unconfigured', 'disconnected', 'connected'].includes(dbService.status),
        `Unexpected database status: ${dbService.status}`
      );
      assert.equal(typeof dbService.connected, 'boolean');
    });

    it('should include Helmet security headers in responses', async () => {
      const response = await request(app).get('/api/health');

      // Verify essential Helmet headers
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.ok(response.headers['x-dns-prefetch-control']);
      // X-Powered-By header should be removed by Helmet
      assert.equal(response.headers['x-powered-by'], undefined);
    });
  });

  describe('Undefined Routes (404 Handler)', () => {
    it('should return 404 with standardized error response for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect('Content-Type', /json/)
        .expect(404);

      assert.equal(response.body.success, false);
      assert.ok(response.body.error);
      assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
      assert.match(response.body.error.message, /does not exist on this server/);
    });
  });

  describe('Centralized Error Handling', () => {
    it('should handle malformed JSON bodies gracefully with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/health')
        .set('Content-Type', 'application/json')
        .send('{"broken_json: true') // Malformed JSON string
        .expect(400);

      assert.equal(response.body.success, false);
      assert.ok(response.body.error);
      assert.equal(response.body.error.code, 'INVALID_JSON_BODY');
      assert.match(response.body.error.message, /Malformed JSON/);
    });

    it('should block disallowed CORS origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-website.com');

      assert.equal(response.status, 403);
      assert.equal(response.body.success, false);
      assert.equal(response.body.error.code, 'CORS_FORBIDDEN');
    });
  });

  describe('Database Module Status Reporting', () => {
    it('should return an accurate status object via getDatabaseStatus()', () => {
      const dbStatus = getDatabaseStatus();
      assert.ok(dbStatus);
      assert.ok('status' in dbStatus);
      assert.ok('connected' in dbStatus);
      assert.equal(typeof dbStatus.connected, 'boolean');
    });
  });
});
