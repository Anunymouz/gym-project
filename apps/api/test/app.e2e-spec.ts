import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

describe('BGYM API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health reports the process is alive', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /v1/health/ready checks the database', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/ready').expect(200);
    expect(res.body.info.database.status).toBe('up');
  });

  it('never leaks internal error details', async () => {
    const res = await request(app.getHttpServer()).get('/v1/gyms/nearby').query({ lat: 'x', lng: 0, radiusKm: 5 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/prisma|postgres|5432|stack/i);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an invalid radius with 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/gyms/nearby')
      .query({ lat: 5.6357, lng: -0.1573, radiusKm: 7 })
      .expect(400);
  });

  it('returns live gyms in range, nearest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/gyms/nearby')
      .query({ lat: 5.6357, lng: -0.1573, radiusKm: 5 })
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const distances = res.body.map((g: { distanceKm: number }) => g.distanceKm);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances.every((d: number) => d <= 5)).toBe(true);
  });
});
