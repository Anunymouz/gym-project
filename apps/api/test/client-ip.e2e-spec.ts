import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from '../src/common/client-ip.js';
import { setupApp } from '../src/setup-app.js';

const SECRET = 'test-dashboard-proxy-secret-0123456789abcdef';

/** Sign-in codes are limited to 5 requests per 10 minutes per client. */
describe('Client IP from the dashboard server (e2e)', () => {
  let app: INestApplication<App>;
  const run = Date.now().toString(36);
  const ask = (headers: Record<string, string>, n: number) =>
    request(app.getHttpServer()).post('/v1/auth/email/request').set(headers).send({ email: `ip-${run}-${n}@example.com` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });
  afterAll(() => app.close());

  it('rate-limits each visitor separately when the dashboard vouches for their IP', async () => {
    const visitorA = { [PROXY_SECRET_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.10' };
    const visitorB = { [PROXY_SECRET_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.11' };
    for (let i = 0; i < 5; i++) expect((await ask(visitorA, i)).status).toBe(202);
    expect((await ask(visitorA, 5)).status).toBe(429);
    expect((await ask(visitorB, 6)).status).toBe(202);
  });

  it('ignores a claimed IP without the right secret, so clients cannot dodge limits', async () => {
    for (let i = 0; i < 5; i++) {
      const spoof = { [PROXY_SECRET_HEADER]: 'wrong-secret', [CLIENT_IP_HEADER]: `198.51.100.${i + 1}` };
      expect((await ask(spoof, 10 + i)).status).toBe(202);
    }
    // All five counted against the real connection, whatever IP was claimed.
    expect((await ask({ [CLIENT_IP_HEADER]: '198.51.100.99' }, 20)).status).toBe(429);
  });
});
