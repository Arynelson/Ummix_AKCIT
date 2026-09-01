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

  it('registra o código seguro da falha interna sem registrar o texto do cliente', async () => {
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
    const userId = '2d5b6f5e-7e4f-4f67-9c4e-0e2b9afcb8a8';
    const campaignId = '147dad44-1eea-411b-9b5d-1f6467d91712';
    const sessionId = '93203443-1fe8-45d0-a90d-8ec96ba8042f';
    const generationId = 'b80b6c68-57cf-45b0-9605-70d53c4dfc1b';
    const finalText = 'texto privado que não deve aparecer no log';
    const error = Object.assign(new Error('value too long for type character varying(32)'), { code: '22001' });

    await app.register(
      async (scoped) => {
        await campaignContentRoutes(scoped, {
          config,
          service: {
            saveSelection: vi.fn().mockRejectedValue(error),
          } as never,
          ummix: {
            getCurrentUser: vi.fn().mockResolvedValue({ id: userId, role: 'cliente', userType: 'cliente' }),
          } as never,
        });
        scoped.setErrorHandler(campaignContentErrorHandler);
      },
      { prefix: '/api/campaigns/:campaignId/ai-content' },
    );

    try {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/campaigns/${campaignId}/ai-content/sessions/${sessionId}/selection`,
        headers: { authorization: 'Bearer user-token' },
        payload: {
          generationId,
          optionId: 'option-uuid',
          finalText,
          expectedSessionVersion: 3,
        },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ message: 'Erro interno do conteúdo de campanha' });
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          diagnostic: 'campaign-content-internal-error',
          operation: 'save_selection',
          requestId: expect.any(String),
          campaignId,
          sessionId,
          generationId,
          errorName: 'Error',
          errorCode: '22001',
          errorMessage: 'value too long for type character varying(32)',
        }),
        expect.any(String),
      );
      expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(finalText);
    } finally {
      await app.close();
    }
  });
});
