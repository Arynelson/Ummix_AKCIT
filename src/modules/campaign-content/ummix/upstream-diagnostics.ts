export type CampaignContentUpstreamFailureKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'server_error'
  | 'upstream_http'
  | 'contract_invalid';

export type CampaignContentContractFailure = 'invalid_json' | 'schema_mismatch';

export interface CampaignContentDiagnosticLogger {
  error(bindings: Record<string, unknown>, message: string): void;
}

export interface CampaignContentUpstreamFailureDetails {
  operation: 'current_user' | 'campaign_context';
  baseUrl: string;
  failureKind: CampaignContentUpstreamFailureKind;
  elapsedMs: number;
  requestId?: string;
  upstreamStatus?: number;
  upstreamRequestId?: string;
  upstreamErrorCode?: string;
  upstreamMessage?: string;
  campaignId?: string;
  contractFailure?: CampaignContentContractFailure;
  issueCount?: number;
}

export function logCampaignContentUpstreamFailure(
  logger: CampaignContentDiagnosticLogger | undefined,
  details: CampaignContentUpstreamFailureDetails,
): void {
  if (!logger) return;

  const bindings: Record<string, unknown> = {
    diagnostic: 'campaign-content-upstream',
    dependency: 'ummix',
    operation: details.operation,
    upstreamHost: getUpstreamHost(details.baseUrl),
    failureKind: details.failureKind,
    elapsedMs: Math.max(0, Math.round(details.elapsedMs)),
  };
  if (details.upstreamStatus !== undefined) bindings.upstreamStatus = details.upstreamStatus;
  if (details.requestId !== undefined) bindings.requestId = sanitizeRequestId(details.requestId);
  if (details.upstreamRequestId !== undefined) {
    bindings.upstreamRequestId = sanitizeRequestId(details.upstreamRequestId);
  }
  if (details.upstreamErrorCode !== undefined) {
    bindings.upstreamErrorCode = sanitizeDiagnosticText(details.upstreamErrorCode, 100);
  }
  if (details.upstreamMessage !== undefined) {
    const message = sanitizeDiagnosticText(details.upstreamMessage, 240);
    if (message) bindings.upstreamMessage = message;
  }
  if (details.campaignId !== undefined) bindings.campaignId = sanitizeCampaignId(details.campaignId);
  if (details.contractFailure !== undefined) bindings.contractFailure = details.contractFailure;
  if (details.issueCount !== undefined) bindings.issueCount = details.issueCount;

  logger.error(bindings, '[campaign-content-diagnostic] upstream dependency failure');
}

export function classifyUpstreamHttpStatus(status: number): CampaignContentUpstreamFailureKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 422) return 'validation';
  if (status >= 500) return 'server_error';
  return 'upstream_http';
}

export function classifyTransportError(error: unknown): 'network' | 'timeout' {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    ? 'timeout'
    : 'network';
}

export function getUpstreamHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || 'unknown';
  } catch {
    return 'invalid-url';
  }
}

function sanitizeCampaignId(campaignId: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)
    ? campaignId
    : 'invalid';
}

function sanitizeRequestId(requestId: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) ? requestId : 'invalid';
}

function sanitizeDiagnosticText(value: string, maxLength: number): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(authorization|x-service-token|password|secret|api[-_]?key|access[-_]?token)\s*[:=]\s*["']?[^\s,;}\]"']+/gi,
      '$1=[REDACTED]',
    )
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
