import { randomUUID } from 'node:crypto';
import type { CampaignContentContext } from '@ummix/ai-contracts';
import { z } from 'zod';
import {
  classifyTransportError,
  classifyUpstreamHttpStatus,
  logCampaignContentUpstreamFailure,
  type CampaignContentUpstreamFailureDetails,
  type CampaignContentDiagnosticLogger,
} from './upstream-diagnostics.js';

const contextSchema = z.object({
  contractVersion: z.literal('1'),
  campaignId: z.string().uuid(),
  userId: z.string().uuid(),
  clientId: z.string().uuid(),
  campaignName: z.string().nullable(),
  brandName: z.string().nullable(),
  objective: z.string().nullable(),
  mediaChannel: z.enum(['radio', 'tv', 'both']),
  format: z.string().nullable(),
  durationSeconds: z.number().int().positive(),
  paymentStatus: z.string().min(1),
  canGenerate: z.boolean(),
  contextVersion: z.string().min(1),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  targetAudience: z.record(z.string(), z.unknown()).nullable(),
});

export class CampaignContentContextError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CampaignContentContextError';
  }
}

export class CampaignContentContextClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken?: string,
    private readonly logger?: CampaignContentDiagnosticLogger,
  ) {}

  async getCampaignContext(
    campaignId: string,
    accessToken: string,
  ): Promise<CampaignContentContext> {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    };
    if (this.serviceToken) headers['x-service-token'] = this.serviceToken;

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/integrations/campaigns/${encodeURIComponent(campaignId)}/ai-content/context`,
        { headers, signal: AbortSignal.timeout(10_000) },
      );
    } catch (error) {
      logCampaignContentUpstreamFailure(this.logger, {
        operation: 'campaign_context',
        baseUrl: this.baseUrl,
        campaignId,
        requestId,
        failureKind: classifyTransportError(error),
        elapsedMs: Date.now() - startedAt,
      });
      throw new CampaignContentContextError('Serviço de campanhas indisponível.', 502);
    }

    if (!response.ok) {
      const upstreamError = await readUpstreamError(response);
      const details: CampaignContentUpstreamFailureDetails = {
        operation: 'campaign_context',
        baseUrl: this.baseUrl,
        campaignId,
        requestId,
        failureKind: classifyUpstreamHttpStatus(response.status),
        upstreamStatus: response.status,
        elapsedMs: Date.now() - startedAt,
      };
      if (upstreamError.requestId) details.upstreamRequestId = upstreamError.requestId;
      if (upstreamError.code) details.upstreamErrorCode = upstreamError.code;
      if ((upstreamError.requestId || upstreamError.code) && upstreamError.message) {
        details.upstreamMessage = upstreamError.message;
      }
      logCampaignContentUpstreamFailure(this.logger, details);
      const status = response.status === 401 || response.status === 403
        ? response.status
        : response.status === 404
          ? 404
          : 502;
      throw new CampaignContentContextError(
        status === 404
          ? 'Campanha não encontrada.'
          : status === 403
            ? 'Você não pode acessar esta campanha.'
            : status === 401
              ? 'Sessão Ummix inválida ou expirada.'
              : 'Serviço de campanhas indisponível.',
        status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      logCampaignContentUpstreamFailure(this.logger, {
        operation: 'campaign_context',
        baseUrl: this.baseUrl,
        campaignId,
        failureKind: 'contract_invalid',
        upstreamStatus: response.status,
        contractFailure: 'invalid_json',
        elapsedMs: Date.now() - startedAt,
      });
      throw new CampaignContentContextError('Contexto da campanha inválido.', 502);
    }

    const parsed = contextSchema.safeParse(payload);
    if (!parsed.success) {
      logCampaignContentUpstreamFailure(this.logger, {
        operation: 'campaign_context',
        baseUrl: this.baseUrl,
        campaignId,
        failureKind: 'contract_invalid',
        upstreamStatus: response.status,
        contractFailure: 'schema_mismatch',
        issueCount: parsed.error.issues.length,
        elapsedMs: Date.now() - startedAt,
      });
      throw new CampaignContentContextError('Contexto da campanha inválido.', 502);
    }
    if (parsed.data.campaignId !== campaignId) {
      logCampaignContentUpstreamFailure(this.logger, {
        operation: 'campaign_context',
        baseUrl: this.baseUrl,
        campaignId,
        failureKind: 'contract_invalid',
        upstreamStatus: response.status,
        contractFailure: 'schema_mismatch',
        issueCount: 1,
        elapsedMs: Date.now() - startedAt,
      });
      throw new CampaignContentContextError('Contexto da campanha inválido.', 502);
    }
    return parsed.data;
  }
}

interface UpstreamErrorDetails {
  requestId?: string;
  code?: string;
  message?: string;
}

async function readUpstreamError(response: Response): Promise<UpstreamErrorDetails> {
  const headerRequestId = toSafeDiagnosticId(response.headers.get('x-request-id'));
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return headerRequestId ? { requestId: headerRequestId } : {};
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return headerRequestId ? { requestId: headerRequestId } : {};
  }

  const body = payload as Record<string, unknown>;
  const requestId = toSafeDiagnosticId(body.requestId) ?? headerRequestId;
  const code = toSafeDiagnosticCode(body.code ?? body.errorCode);
  const message = toSafeDiagnosticText(body.message);
  return {
    ...(requestId ? { requestId } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
}

function toSafeDiagnosticId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

function toSafeDiagnosticCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)
    ? value
    : undefined;
}

function toSafeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return normalized || undefined;
}
