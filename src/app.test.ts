import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './server/app.ts';

describe('ZOLO Backend API Health', () => {
  const app = createApp();

  it('GET /api/health responds with status info', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });

  it('GET /api/nonexistent returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('unknown API methods return a JSON 404 with the request path', async () => {
    const res = await request(app).post('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'API_NOT_FOUND',
      error: 'API endpoint not found: POST /api/nonexistent',
    });
  });

  it('returns a sanitized JSON error for malformed request bodies', async () => {
    const res = await request(app)
      .post('/api/nonexistent')
      .set('Content-Type', 'application/json')
      .send('{invalid');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'INVALID_JSON',
      error: 'Request body contains invalid JSON.',
    });
    expect(res.text).not.toContain('node_modules');
  });

  it('registers link preview independently of the public client config request', async () => {
    const res = await request(app).post('/api/links/preview').send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('requires an authenticated session for advertiser verification and publishing', async () => {
    const start = await request(app)
      .post('/api/ads/visit-verifications')
      .send({ submissionId: '4a01df25-8d7e-4863-8021-1971e7a5a31a' });
    const complete = await request(app)
      .post('/api/ads/visit-verifications/4a01df25-8d7e-4863-8021-1971e7a5a31a/complete');
    const cancel = await request(app)
      .delete('/api/ads/visit-verifications/4a01df25-8d7e-4863-8021-1971e7a5a31a');
    const publish = await request(app).post('/api/ads/campaigns').send({});

    expect(start.status).toBe(401);
    expect(complete.status).toBe(401);
    expect(cancel.status).toBe(401);
    expect(publish.status).toBe(401);
  });

  it('public config exposes only the Firebase web messaging settings', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.firebaseMessaging.config).toHaveProperty('projectId');
    expect(res.body.firebaseMessaging).toHaveProperty('vapidPublicKey');
    expect(res.body.firebaseMessaging).not.toHaveProperty('serviceAccount');
    expect(res.body).not.toHaveProperty('firebaseServiceAccount');
  });

  it('serves a Firebase messaging worker without backend credentials', async () => {
    const res = await request(app).get('/firebase-messaging-sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/javascript');
    expect(res.text).toContain('onBackgroundMessage');
    expect(res.text).toContain('notificationclick');
    expect(res.text).not.toContain('private_key');
  });

  it('requires an authenticated session for notification token registration', async () => {
    const res = await request(app)
      .post('/api/notifications/devices')
      .send({ token: 'a-valid-looking-registration-token-with-enough-length' });
    expect(res.status).toBe(401);
  });
});
