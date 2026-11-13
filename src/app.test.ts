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
