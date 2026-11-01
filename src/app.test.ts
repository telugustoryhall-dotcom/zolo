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
});
