import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config.js';
import { UmmixApiError } from '../../campaign-assistant/ummix/ummix-client.js';
import {
  campaignContentErrorHandler,
  campaignContentRoutes,
} from './campaign-content-routes.js';

afterEach(() => vi.restoreAllMocks());

const config = {
  NODE_ENV: 'test',
  UMMIX_API_URL: 'https://services.test/api',
  CAMPAIGN_CONTENT_ENABLED: true,
} as AppConfig;

describe('campaign content routes', () => {
  it('records the upstream authentication status without logging the bearer token', async () => {
    const loggerSpy = vi.fn();
    const logger = {
      child: vi.fn(() => logger),
      error: loggerSpy,
      fatal: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      level: 'silent',
    };
    const app = Fastify({ loggerInstance: logger as never });
    const userToken = 'user-token-that-must-not-be-logged';

    await app.register(
      async (scoped) => {
        await campaignContentRoutes(scoped, {
          config,
          service: {} as never,
          ummix: {
            getCurrentUser: vi.fn().mockRejectedValue(new UmmixApiError('hidden', 500)),
          } as never,
        });
        scoped.setErrorHandler(campaignContentErrorHandler);
      },
      { prefix: '/api/campaigns/:campaignId/ai-content' },
    );

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/campaigns/147dad44-1eea-411b-9b5d-1f6467d91712/ai-content',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: 'Serviço de autenticação indisponível' });
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          diagnostic: 'campaign-content-upstream',
          operation: 'current_user',
          upstreamHost: 'services.test',
          upstreamStatus: 500,
          failureKind: 'server_error',
          elapsedMs: expect.any(Number),
        }),
        expect.any(String),
      );
      expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(userToken);
    } finally {
      await app.close();
    }
  });
});
