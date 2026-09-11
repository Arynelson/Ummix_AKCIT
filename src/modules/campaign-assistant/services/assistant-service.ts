import type { AppConfig } from '../../../config.js';
import { SessionRepository } from '../db/session-repository.js';
import {
  applyExtractedPatch,
  campaignLocations,
  canCalculateComparison,
  initialState,
  isReadyToFinalize,
  missingFields,
  nextAssistantTurn,
} from '../domain/state-machine.js';
import type {
  AssistantSession,
  AudienceCatalogOption,
  AudienceClarificationOption,
  AudienceFilterSelection,
  CampaignState,
  ChatMessage,
  ClientSnapshot,
  ExtractedCampaignPatch,
  ValidatedCampaignPatch,
} from '../domain/types.js';
import {
  CampaignBriefExtractor,
  OpenAIUnavailableError,
} from '../openai/extractor.js';
import {
  getAudienceCatalogWithCoreDemographics,
  inferNaturalAudienceFilters,
  mapAudienceFiltersToTargetAudience,
} from '../domain/audience-filter-mapper.js';
import {
  currentDateInBrazil,
  normalizeContextualPatch,
} from '../domain/contextual-input.js';
import { UmmixClient, type UmmixUser } from '../ummix/ummix-client.js';

export interface SessionView {
  id: string;
  status: AssistantSession['status'];
  client: ClientSnapshot;
  state: CampaignState;
  messages: ChatMessage[];
  missingFields: ReturnType<typeof missingFields>;
  quickReplies: string[];
  readyToFinalize: boolean;
  expiresAt: string;
  finalization: {
    campaignId: string;
    wizardStep: 4;
    reviewUrl: string;
  } | null;
}

interface AssistantDiagnosticLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  warn(bindings: Record<string, unknown>, message: string): void;
}

export class AssistantService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: SessionRepository,
    private readonly ummix: UmmixClient,
    private readonly extractor: CampaignBriefExtractor,
    private readonly logger?: AssistantDiagnosticLogger,
  ) {}

  async getContext(token: string, user: UmmixUser) {
    const clients = await this.ummix.getAvailableClients(token, user);
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        userType: user.userType,
      },
      clients,
      requiresClientSelection: user.userType !== 'regular_client',
    };
  }

  async createSession(input: {
    token: string;
    user: UmmixUser;
    clientId?: string;
  }): Promise<SessionView> {
    const [client, minimumInvestment, locationOptions, stateOptions] = await Promise.all([
      this.ummix.getAuthorizedClient(input.token, input.user, input.clientId),
      this.ummix.getMinimumInvestment(input.token),
      this.ummix.getAvailableLocations(input.token),
      this.ummix.getAvailableStates(input.token).catch(() => []),
    ]);
    const state = initialState(
      minimumInvestment,
      client.businessActivity,
      locationOptions,
      stateOptions,
    );
    const initialTurn = nextAssistantTurn(state, {
      clientName: displayClient(client),
    });
    const initialMessage: ChatMessage = {
      role: 'assistant',
      content: initialTurn.message,
      createdAt: new Date().toISOString(),
    };
    const session = await this.repository.create({
      userId: input.user.id,
      userType: input.user.userType,
      client,
      state,
      initialMessage,
      ttlMinutes: this.config.SESSION_TTL_MINUTES,
    });
    await this.repository.trackMetric({
      sessionId: session.id,
      userType: session.userType,
      eventName: 'session_started',
    });
    return this.toView(session);
  }

  async getSession(id: string, userId: string, token?: string): Promise<SessionView> {
    const session = await this.requireOwnedSession(id, userId);
    if (!session.state.locationOptions?.length && token) {
      session.state = {
        ...session.state,
        locationOptions: await this.ummix.getAvailableLocations(token),
      };
    }
    if (!session.state.stateOptions?.length && token) {
      session.state = {
        ...session.state,
        stateOptions: await this.ummix.getAvailableStates(token).catch(() => []),
      };
    }
    return this.toView(session);
  }

  async sendMessage(input: {
    id: string;
    token: string;
    user: UmmixUser;
    message: string;
  }): Promise<
    SessionView & {
      assistantMessage: string;
      fallbackToManual: boolean;
    }
  > {
    const session = await this.requireActiveSession(input.id, input.user.id);
    const recentMessages = await this.repository.countRecentMessages(
      session.id,
      this.config.MESSAGE_WINDOW_MINUTES,
    );
    if (recentMessages >= this.config.MESSAGE_LIMIT_PER_WINDOW) {
      throw new AssistantHttpError(
        429,
        `Limite de ${this.config.MESSAGE_LIMIT_PER_WINDOW} mensagens por ${this.config.MESSAGE_WINDOW_MINUTES} minutos atingido.`,
      );
    }
    await this.repository.trackMetric({
      sessionId: session.id,
      userType: session.userType,
      eventName: 'message_sent',
    });

    let nextState = session.state;
    if (!nextState.locationOptions?.length) {
      const [locationOptions, stateOptions] = await Promise.all([
        this.ummix.getAvailableLocations(input.token),
        this.ummix.getAvailableStates(input.token).catch(() => []),
      ]);
      nextState = { ...nextState, locationOptions, stateOptions };
    }
    let fallbackToManual = false;
    try {
      const selectedAudienceAlternative = resolveAudienceClarification(
        input.message,
        nextState.audienceClarification,
      );
      if (selectedAudienceAlternative) {
        nextState = {
          ...nextState,
          audienceFilters: mergeAudienceFilters(
            nextState.audienceFilters ?? [],
            selectedAudienceAlternative.filters,
          ),
          audienceClarification: null,
          comparison: null,
          selectedChannel: null,
        };
      } else {
        const fullAudienceCatalog = await this.ummix
          .getAudienceCatalog(input.token)
          .catch(() => [] as AudienceCatalogOption[]);
        const currentField = nextState.audienceClarification
          ? 'audienceConfirmation'
          : missingFields(nextState)[0] ?? null;
        const referenceDate = currentDateInBrazil();
        // A resposta pode refinar um público já informado mesmo depois de a
        // máquina ter avançado para orçamento ou data. A decisão usa o
        // catálogo completo para não depender de uma lista fixa de palavras
        // (que inevitavelmente ficaria defasada quando o Services ganhar um
        // novo filtro).
        const hasCatalogMatch = inferNaturalAudienceFilters(
          input.message,
          fullAudienceCatalog,
        ).length > 0;
        const isAudienceTurn = shouldUseAudienceCatalog(
          input.message,
          currentField,
          nextState,
          hasCatalogMatch,
        );
        const audienceCatalog = selectAudienceCatalog(
          input.message,
          fullAudienceCatalog,
          isAudienceTurn,
        );
        let inferredFilters = isAudienceTurn
          ? inferNaturalAudienceFilters(input.message, fullAudienceCatalog)
          : [];
        let extractedPatch: ExtractedCampaignPatch;
        try {
          extractedPatch = await this.extractor.extract({
            message: input.message,
            currentState: nextState,
            userId: input.user.id,
            audienceCatalog,
            currentField,
            referenceDate,
          });
        } catch (error) {
          if (!(error instanceof OpenAIUnavailableError)) throw error;
          // A catalog-driven deterministic pass keeps explicit demographic and
          // allowlisted phrases useful when the LLM times out or returns an
          // invalid structured response. The user can continue manually and
          // the failure remains observable through the existing metric.
          extractedPatch = emptyExtractedPatch(isAudienceTurn ? input.message : null);
          fallbackToManual = true;
          await this.repository.trackMetric({
            sessionId: session.id,
            userType: session.userType,
            eventName: 'manual_fallback',
            metadata: { stage: 'llm' },
          });
        }
        const patch = normalizeContextualPatch(extractedPatch, {
          message: input.message,
          currentField,
          referenceDate,
        });
        // A lista enviada ao LLM pode ser ranqueada para economizar contexto.
        // A validação final usa o catálogo completo para não descartar uma
        // dimensão que não apareceu entre os primeiros candidatos. Os
        // fallbacks nativos de sexo/idade também entram nessa allowlist.
        const validatedPatch = validateAudiencePatch(patch, fullAudienceCatalog);
        const effectiveAudienceTurn = isAudienceTurn || Boolean(patch.audienceDescription?.trim());
        if (effectiveAudienceTurn && !isAudienceTurn) {
          inferredFilters = inferNaturalAudienceFilters(input.message, fullAudienceCatalog);
        }
        const audienceFilters = dedupeAudienceFilters([
          ...(validatedPatch.audienceFilters ?? []),
          ...inferredFilters,
        ]);
        const llmCandidateKeys = (patch.audienceFilters ?? []).map(
          (filter) => `${filter.questionId}:${filter.optionId}`,
        );
        const validatedKeys = (validatedPatch.audienceFilters ?? []).map(
          (filter) => `${filter.questionId}:${filter.optionId}`,
        );
        const classificationFields = Object.keys(
          mapAudienceFiltersToTargetAudience(audienceFilters),
        ).filter((key) => key !== 'selections' && key !== 'sexo').sort();
        const deterministicKeys = new Set(
          inferredFilters.map((filter) => `${filter.questionId}:${filter.optionId}`),
        );
        const validatedKeySet = new Set(validatedKeys);
        const filterResolution = audienceFilters.map((filter) => {
          const key = `${filter.questionId}:${filter.optionId}`;
          const mappedFields = Object.keys(mapAudienceFiltersToTargetAudience([filter]))
            .filter((field) => field !== 'selections' && field !== 'sexo')
            .sort();
          return {
            key,
            source: deterministicKeys.has(key) && validatedKeySet.has(key)
              ? 'llm+deterministic'
              : deterministicKeys.has(key)
                ? 'deterministic'
                : validatedKeySet.has(key)
                  ? 'llm'
                  : 'merged',
            mappedFields,
          };
        });
        this.logger?.info(
          {
            diagnostic: 'campaign-assistant-audience-classification',
            currentField,
            isAudienceTurn: effectiveAudienceTurn,
            catalogOptionCount: fullAudienceCatalog.length,
            llmCatalogOptionCount: audienceCatalog.length,
            validatedFilterCount: validatedPatch.audienceFilters?.length ?? 0,
            inferredFilterCount: inferredFilters.length,
            finalFilterCount: audienceFilters.length,
            llmCandidateCount: llmCandidateKeys.length,
            llmCandidateKeys,
            validatedKeys,
            rejectedLlmCandidateCount: Math.max(
              0,
              llmCandidateKeys.filter((key) => !validatedKeys.includes(key)).length,
            ),
            deterministicFilterKeys: inferredFilters.map(
              (filter) => `${filter.questionId}:${filter.optionId}`,
            ),
            selectedFilterKeys: audienceFilters.map(
              (filter) => `${filter.questionId}:${filter.optionId}`,
            ),
            filterResolution,
            recognizedFieldKeys: classificationFields,
            llmFallback: fallbackToManual,
          },
          '[campaign-assistant-diagnostic] audience classification',
        );
        const audienceDescription = patch.audienceDescription?.trim()
          || (effectiveAudienceTurn ? input.message.trim().slice(0, 500) : '');
        const enrichedPatch: ValidatedCampaignPatch = {
          ...validatedPatch,
          ...(audienceDescription
            ? { audienceDescription, audienceFilters }
            : audienceFilters.length > 0
              ? { audienceFilters }
              : {}),
          ...(audienceFilters.length > 0 ? { audienceAlternatives: [] } : {}),
        };
        nextState = applyExtractedPatch(nextState, enrichedPatch);
        nextState = await this.resolveLocationIfPresent(input.token, nextState, patch);
      }

      if (canCalculateComparison(nextState) && !nextState.comparison) {
        nextState = {
          ...nextState,
          comparison: await this.ummix.compareChannels(input.token, nextState),
        };
      }
    } catch (error) {
      fallbackToManual = error instanceof OpenAIUnavailableError;
      await this.repository.trackMetric({
        sessionId: session.id,
        userType: session.userType,
        eventName: fallbackToManual ? 'manual_fallback' : 'error',
        metadata: { stage: fallbackToManual ? 'llm' : 'message_processing' },
      });
    }

    const turn = nextAssistantTurn(nextState, {
      llmUnavailable: fallbackToManual,
      clientName: displayClient(session.clientSnapshot),
    });
    const now = new Date().toISOString();
    const messages: ChatMessage[] = [
      ...session.messages,
      { role: 'user', content: input.message, createdAt: now },
      { role: 'assistant', content: turn.message, createdAt: now },
    ];
    const becameReady = isReadyToFinalize(nextState) && session.status !== 'ready';
    const saved = await this.repository.saveTurn({
      id: session.id,
      userId: input.user.id,
      expectedVersion: session.version,
      state: nextState,
      messages,
      status: isReadyToFinalize(nextState) ? 'ready' : 'collecting',
      ttlMinutes: this.config.SESSION_TTL_MINUTES,
    });
    if (!saved) {
      throw new AssistantHttpError(
        409,
        'A sessão foi atualizada em outra janela. Recarregue antes de continuar.',
      );
    }
    if (becameReady) {
      await this.repository.trackMetric({
        sessionId: saved.id,
        userType: saved.userType,
        eventName: 'proposal_ready',
      });
    }

    return {
      ...this.toView(saved),
      assistantMessage: turn.message,
      fallbackToManual,
    };
  }

  async selectLocations(input: {
    id: string;
    token: string;
    user: UmmixUser;
    cityIds: string[];
  }): Promise<SessionView & { assistantMessage: string; fallbackToManual: false }> {
    const session = await this.requireActiveSession(input.id, input.user.id);
    const requestedIds = [...new Set(input.cityIds)];
    const locationOptions =
      session.state.locationOptions?.length
        ? session.state.locationOptions
        : await this.ummix.getAvailableLocations(input.token);
    const byId = new Map(locationOptions.map((location) => [location.cityId, location]));
    const selectedLocations = requestedIds
      .map((cityId) => byId.get(cityId))
      .filter((location): location is NonNullable<typeof location> => Boolean(location));

    if (selectedLocations.length !== requestedIds.length) {
      throw new AssistantHttpError(
        422,
        'Uma ou mais praças não estão disponíveis para campanha.',
      );
    }

    let nextState: CampaignState = {
      ...session.state,
      locationOptions,
      locations: selectedLocations,
      location: selectedLocations[0] ?? null,
      unresolvedLocation: null,
      comparison: null,
      selectedChannel: null,
    };
    if (canCalculateComparison(nextState)) {
      nextState = {
        ...nextState,
        comparison: await this.ummix.compareChannels(input.token, nextState),
      };
    }

    const turn = nextAssistantTurn(nextState, {
      clientName: displayClient(session.clientSnapshot),
    });
    const now = new Date().toISOString();
    const cityLabels = selectedLocations.map(
      (location) =>
        `${location.cityName}${location.stateUf ? `/${location.stateUf}` : ''}`,
    );
    const messages: ChatMessage[] = [
      ...session.messages,
      {
        role: 'user',
        content: `Praças selecionadas: ${cityLabels.join(', ')}`,
        createdAt: now,
      },
      { role: 'assistant', content: turn.message, createdAt: now },
    ];
    const saved = await this.repository.saveTurn({
      id: session.id,
      userId: input.user.id,
      expectedVersion: session.version,
      state: nextState,
      messages,
      status: isReadyToFinalize(nextState) ? 'ready' : 'collecting',
      ttlMinutes: this.config.SESSION_TTL_MINUTES,
    });
    if (!saved) {
      throw new AssistantHttpError(
        409,
        'A sessão foi atualizada em outra janela. Recarregue antes de continuar.',
      );
    }
    await this.repository.trackMetric({
      sessionId: saved.id,
      userType: saved.userType,
      eventName: 'message_sent',
    });
    return {
      ...this.toView(saved),
      assistantMessage: turn.message,
      fallbackToManual: false,
    };
  }

  async confirmAudienceClarification(input: {
    id: string;
    token: string;
    user: UmmixUser;
    alternativeId: string;
  }): Promise<SessionView & { assistantMessage: string; fallbackToManual: false }> {
    const session = await this.requireActiveSession(input.id, input.user.id);
    const clarification = session.state.audienceClarification;
    const alternative = clarification?.options.find(
      (option) => option.id === input.alternativeId,
    );
    if (!alternative) {
      throw new AssistantHttpError(
        422,
        'A alternativa de público não está mais disponível. Descreva o público novamente.',
      );
    }

    let nextState: CampaignState = {
      ...session.state,
      audienceFilters: mergeAudienceFilters(
        session.state.audienceFilters ?? [],
        alternative.filters,
      ),
      audienceClarification: null,
      comparison: null,
      selectedChannel: null,
    };
    if (canCalculateComparison(nextState)) {
      nextState = {
        ...nextState,
        comparison: await this.ummix.compareChannels(input.token, nextState),
      };
    }

    const turn = nextAssistantTurn(nextState, {
      clientName: displayClient(session.clientSnapshot),
    });
    const now = new Date().toISOString();
    const messages: ChatMessage[] = [
      ...session.messages,
      {
        role: 'user',
        content: 'Público selecionado: ' + alternative.label,
        createdAt: now,
      },
      { role: 'assistant', content: turn.message, createdAt: now },
    ];
    const saved = await this.repository.saveTurn({
      id: session.id,
      userId: input.user.id,
      expectedVersion: session.version,
      state: nextState,
      messages,
      status: isReadyToFinalize(nextState) ? 'ready' : 'collecting',
      ttlMinutes: this.config.SESSION_TTL_MINUTES,
    });
    if (!saved) {
      throw new AssistantHttpError(
        409,
        'A sessão foi atualizada em outra janela. Recarregue antes de continuar.',
      );
    }
    await this.repository.trackMetric({
      sessionId: saved.id,
      userType: saved.userType,
      eventName: 'audience_clarification_confirmed',
      metadata: { alternativeId: alternative.id },
    });
    return {
      ...this.toView(saved),
      assistantMessage: turn.message,
      fallbackToManual: false,
    };
  }

  async finalize(input: {
    id: string;
    token: string;
    user: UmmixUser;
  }): Promise<{ campaignId: string; wizardStep: 4; reviewUrl: string }> {
    let session = await this.requireOwnedSession(input.id, input.user.id);
    if (session.status === 'completed' && session.finalizedCampaignId) {
      return this.finalizationResult(session.id, session.finalizedCampaignId);
    }
    if (session.status === 'expired') {
      throw new AssistantHttpError(410, 'A sessão expirou. Inicie uma nova proposta.');
    }
    if (!isReadyToFinalize(session.state)) {
      throw new AssistantHttpError(422, 'A proposta ainda possui campos obrigatórios pendentes.');
    }

    const claim = await this.repository.claimFinalization(session.id, input.user.id);
    session = claim.session ?? session;
    let campaignId = session.finalizedCampaignId;
    if (!claim.claimed && !campaignId) {
      throw new AssistantHttpError(409, 'A finalização da campanha já está em andamento.');
    }
    if (!campaignId) {
      try {
        const draft = await this.ummix.createDraft(input.token, {
          campaignName: campaignName(session.state),
          clientId: session.clientId,
        });
        campaignId = draft.id;
        await this.repository.rememberDraft(session.id, input.user.id, campaignId);
      } catch (error) {
        await this.repository.releaseFinalization(session.id, input.user.id);
        throw error;
      }
    }

    const payload = buildCampaignPayload(session, campaignId);
    const selectedPlan = session.state.selectedChannel && session.state.comparison
      ? session.state.comparison[session.state.selectedChannel]
      : null;
    const contractedImpressions = Number(payload.impressoesContratadas ?? 0);
    const contractedInvestment = Number(payload.totalInvestment ?? 0);
    const contractedCostFromImpressions = selectedPlan?.cpm && Number.isFinite(selectedPlan.cpm)
      ? roundCurrency((contractedImpressions * selectedPlan.cpm) / 1000)
      : null;
    this.logger?.info(
      {
        diagnostic: 'campaign-assistant-budget-contract',
        campaignId,
        maximumBudget: session.state.maximumBudget,
        cpm: selectedPlan?.cpm ?? null,
        frequency: payload.frequency,
        availableAudience: selectedPlan?.audienceImpacts ?? null,
        contractedReach: payload.totalReach,
        contractedImpressions: payload.impressoesContratadas,
        contractedInvestment,
        contractedCostFromImpressions,
        budgetInvariant: contractedCostFromImpressions === contractedInvestment &&
          contractedInvestment <= (session.state.maximumBudget ?? Number.POSITIVE_INFINITY),
      },
      '[campaign-assistant-diagnostic] budget contract prepared',
    );
    await this.ummix.updateCampaign(input.token, campaignId, payload);
    await this.repository.complete(session.id, input.user.id, campaignId);
    await this.repository.trackMetric({
      sessionId: session.id,
      userType: session.userType,
      eventName: 'draft_created',
      metadata: { channel: session.state.selectedChannel },
    });
    return this.finalizationResult(session.id, campaignId);
  }

  async markReviewReached(id: string, user: UmmixUser): Promise<void> {
    const marked = await this.repository.markReviewReached(id, user.id);
    if (!marked) throw new AssistantHttpError(404, 'Sessão concluída não encontrada');
    await this.repository.trackMetric({
      sessionId: id,
      userType: user.userType,
      eventName: 'review_reached',
    });
  }

  async deleteSession(id: string, userId: string): Promise<void> {
    const deleted = await this.repository.deleteOwned(id, userId);
    if (!deleted) throw new AssistantHttpError(404, 'Sessão não encontrada');
  }

  private async resolveLocationIfPresent(
    token: string,
    state: CampaignState,
    patch: ExtractedCampaignPatch,
  ): Promise<CampaignState> {
    if (!patch.cityName) return state;
    const location = await this.ummix.resolveLocation(token, patch.cityName, patch.stateUf);
    return {
      ...state,
      location,
      locations: location ? [location] : [],
      unresolvedLocation: location
        ? null
        : [patch.cityName, patch.stateUf].filter(Boolean).join('/'),
      comparison: location ? state.comparison : null,
    };
  }

  private async requireOwnedSession(id: string, userId: string): Promise<AssistantSession> {
    const session = await this.repository.findOwned(id, userId);
    if (!session) throw new AssistantHttpError(404, 'Sessão não encontrada');
    return session;
  }

  private async requireActiveSession(id: string, userId: string): Promise<AssistantSession> {
    const session = await this.requireOwnedSession(id, userId);
    if (new Date(session.expiresAt).getTime() <= Date.now() || session.status === 'expired') {
      throw new AssistantHttpError(410, 'A sessão expirou. Inicie uma nova proposta.');
    }
    if (session.status === 'completed') {
      throw new AssistantHttpError(409, 'Esta sessão já foi concluída.');
    }
    if (session.status === 'finalizing') {
      throw new AssistantHttpError(409, 'Esta sessão está sendo finalizada.');
    }
    return session;
  }

  private toView(session: AssistantSession): SessionView {
    const turn = nextAssistantTurn(session.state, {
      clientName: displayClient(session.clientSnapshot),
    });
    return {
      id: session.id,
      status: session.status,
      client: session.clientSnapshot,
      state: session.state,
      messages: session.messages,
      missingFields: session.status === 'completed' ? [] : missingFields(session.state),
      quickReplies: session.status === 'completed' ? [] : turn.quickReplies,
      readyToFinalize: session.status === 'ready' && isReadyToFinalize(session.state),
      expiresAt: session.expiresAt,
      finalization: session.finalizedCampaignId
        ? this.finalizationResult(session.id, session.finalizedCampaignId)
        : null,
    };
  }

  private finalizationResult(sessionId: string, campaignId: string) {
    const parameters = new URLSearchParams({
      campaignId,
      step: '4',
      source: 'ai_assistant',
      assistantSessionId: sessionId,
    });
    return {
      campaignId,
      wizardStep: 4 as const,
      reviewUrl: `${this.config.UMMIX_WEB_URL}/wizard?${parameters.toString()}`,
    };
  }
}

export class AssistantHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AssistantHttpError';
  }
}

function displayClient(client: ClientSnapshot): string {
  return client.companyName || client.companyBrand || client.fullName;
}

function emptyExtractedPatch(audienceDescription: string | null): ExtractedCampaignPatch {
  return {
    productService: null,
    objective: null,
    audienceDescription,
    audienceFilters: [],
    audienceAlternatives: [],
    cityName: null,
    stateUf: null,
    maximumBudget: null,
    desiredStartDate: null,
    selectedChannel: null,
  };
}

function campaignName(state: CampaignState): string {
  const base = state.productService || 'Campanha com IA';
  return `Campanha - ${base}`.slice(0, 120);
}

function buildCampaignPayload(
  session: AssistantSession,
  campaignId: string,
): Record<string, unknown> {
  const state = session.state;
  const locations = campaignLocations(state);
  const channel = state.selectedChannel;
  const plan = channel && state.comparison ? state.comparison[channel] : null;
  if (
    !channel ||
    !plan ||
    !state.objective ||
    locations.length === 0 ||
    !state.maximumBudget ||
    !state.desiredStartDate
  ) {
    throw new AssistantHttpError(422, 'Proposta incompleta');
  }
  const periodWeeks = plan.periodWeeks ?? 1;
  const primaryLocation = locations[0]!;
  const cityNames = locations.map((location) => location.cityName);
  const cityIds = locations.map((location) => location.cityId);
  const states = [
    ...new Set(
      locations
        .map((location) => location.stateUf)
        .filter((stateUf): stateUf is string => Boolean(stateUf)),
    ),
  ];
  const audienceFilters = state.audienceFilters ?? [];
  const contractedPlan = contractPlanToBudget(state.maximumBudget, plan);

  return {
    campaignName: campaignName(state),
    brandName:
      state.objective === 'reconhecimento_marca'
        ? state.productService
          || session.clientSnapshot.companyBrand
          || session.clientSnapshot.companyName
          || undefined
        : session.clientSnapshot.companyBrand ?? session.clientSnapshot.companyName ?? undefined,
    objective: state.objective,
    startDate: state.desiredStartDate,
    endDate: addPeriod(state.desiredStartDate, periodWeeks),
    totalInvestment: contractedPlan.totalInvestment,
    targetAudience: {
      description: state.audienceDescription,
      cidade: primaryLocation.cityName,
      cities: cityNames,
      cityId: primaryLocation.cityId,
      cityIds,
      states,
      // Mantém também os nomes canônicos consumidos pelo mapper do services.
      cidades: cityNames,
      estados: states,
      ...mapAudienceFiltersToTargetAudience(audienceFilters),
      audienceFilters,
    },
    mediaChannel: channel,
    ...(channel === 'radio' ? { spotDurationRadio: '15' } : { spotDurationTv: '15' }),
    audienceReach: contractedPlan.totalReach,
    baseCpm: plan.cpm ?? 0,
    finalCpm: plan.cpm ?? 0,
    clientId: session.clientId,
    aiDimensioning: {
      source: 'ai_assistant',
      assistantSessionId: session.id,
      generatedDraftId: campaignId,
      budgetIsHardCap: true,
      durationSeconds: state.durationSeconds,
      comparison: state.comparison,
    },
    impressoesContratadas: contractedPlan.totalImpressions,
    brandStrength: state.brandStrength,
    format: channel === 'radio' ? 'spot' : 'vt',
    frequency: contractedPlan.frequency,
    period: Math.max(1, toNonNegativeInteger(periodWeeks, 1)),
    totalReach: contractedPlan.totalReach,
  };
}

export function contractPlanToBudget(
  maximumBudget: number,
  plan: NonNullable<CampaignState['comparison']>['radio'],
): {
  frequency: number;
  totalReach: number;
  totalImpressions: number;
  totalInvestment: number;
} {
  const frequency = Math.max(1, toNonNegativeInteger(plan.frequency, 1));
  const cpm = Number(plan.cpm ?? 0);
  if (!(cpm > 0) || !Number.isFinite(cpm)) {
    throw new AssistantHttpError(422, 'Plano de mídia sem CPM válido');
  }

  const budget = Math.max(0, maximumBudget);
  // Primeiro limitamos as impressões pelo teto financeiro e só depois
  // derivamos alcance. Usar a audiência inteira e aplicar `min(budget,
  // custo)` no final produzia exatamente o erro observado: o resumo mostrava
  // impressões que custariam mais do que o investimento informado.
  const maxAffordableImpressions = Math.floor((budget * 1000) / cpm);
  const reachByBudget = Math.floor(maxAffordableImpressions / frequency);
  const availableAudience = Math.floor(
    Math.max(0, Number(plan.audienceImpacts ?? plan.inventory ?? 0)),
  );
  let totalReach = Math.min(reachByBudget, availableAudience);
  let totalImpressions = totalReach * frequency;
  let calculatedInvestment = roundCurrency((totalImpressions * cpm) / 1000);

  // O arredondamento para centavos pode ultrapassar o teto por alguns
  // centavos mesmo quando as impressões estão dentro da divisão real. Reduzir
  // uma unidade de alcance mantém a identidade do resumo verdadeira e o
  // teto rígido inclusive no valor exibido.
  while (totalReach > 0 && calculatedInvestment > budget) {
    totalReach -= 1;
    totalImpressions = totalReach * frequency;
    calculatedInvestment = roundCurrency((totalImpressions * cpm) / 1000);
  }

  return {
    frequency,
    totalReach,
    totalImpressions,
    totalInvestment: calculatedInvestment,
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNonNegativeInteger(value: number | null | undefined, fallback = 0): number {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function validateAudiencePatch(
  patch: ExtractedCampaignPatch,
  catalog: AudienceCatalogOption[],
): ValidatedCampaignPatch {
  const validationCatalog = getAudienceCatalogWithCoreDemographics(catalog);
  const allowed = new Map(
    validationCatalog.map((option) => [
      `${option.questionId}:${option.optionId}`,
      {
        questionId: option.questionId,
        question: option.question,
        optionId: option.optionId,
        option: option.option,
        ...(option.questionOriginal ? { questionOriginal: option.questionOriginal } : {}),
        ...(option.fieldKey ? { fieldKey: option.fieldKey } : {}),
        ...(option.category !== undefined ? { category: option.category } : {}),
      },
    ]),
  );
  const toSelection = (candidate: { questionId: string; optionId: string; confidence: number }) =>
    candidate.confidence >= 0.7
      ? allowed.get(`${candidate.questionId}:${candidate.optionId}`)
      : undefined;
  const validated = (patch.audienceFilters ?? [])
    .map(toSelection)
    .filter((selection): selection is AudienceFilterSelection => Boolean(selection));
  const validatedAlternatives = (patch.audienceAlternatives ?? [])
    .filter((alternative) => alternative.confidence >= 0.7)
    .map((alternative) =>
      dedupeAudienceFilters(
        alternative.audienceFilters
          .map(toSelection)
          .filter((selection): selection is AudienceFilterSelection => Boolean(selection)),
      ),
    )
    .filter((filters) => filters.length > 0)
    .filter((filters, index, all) => {
      const signature = filters
        .map((filter) => `${filter.questionId}:${filter.optionId}`)
        .sort()
        .join('|');
      return all.findIndex((candidate) =>
        candidate
          .map((filter) => `${filter.questionId}:${filter.optionId}`)
          .sort()
          .join('|') === signature,
      ) === index;
    })
    .slice(0, 2)
    .map((filters, index) => ({
      id: `audience-${String.fromCharCode(97 + index)}`,
      label: buildAudienceAlternativeLabel(filters),
      filters,
    }));

  const {
    audienceFilters: _audienceFilters,
    audienceAlternatives: _audienceAlternatives,
    ...basePatch
  } = patch;
  const hasDescription = Boolean(patch.audienceDescription?.trim());
  const hasFilterCandidates = (patch.audienceFilters?.length ?? 0) > 0;
  return {
    ...basePatch,
    ...(hasDescription || hasFilterCandidates
      ? { audienceFilters: dedupeAudienceFilters(validated) }
      : {}),
    ...(hasDescription
      ? {
          audienceAlternatives:
            validatedAlternatives.length >= 2 ? validatedAlternatives : [],
        }
      : {}),
  };
}

function dedupeAudienceFilters(filters: AudienceFilterSelection[]): AudienceFilterSelection[] {
  const unique = new Map<string, AudienceFilterSelection>();
  for (const filter of filters) {
    unique.set(`${filter.questionId}:${filter.optionId}`, filter);
  }
  return [...unique.values()];
}

function buildAudienceAlternativeLabel(filters: AudienceFilterSelection[]): string {
  const grouped = new Map<string, string[]>();
  for (const filter of filters) {
    const values = grouped.get(filter.question) ?? [];
    values.push(filter.option);
    grouped.set(filter.question, values);
  }
  return [...grouped.entries()]
    .map(([question, options]) => `${question}: ${[...new Set(options)].join(', ')}`)
    .join(' · ')
    .slice(0, 240);
}

function resolveAudienceClarification(
  message: string,
  clarification: CampaignState['audienceClarification'],
): AudienceClarificationOption | null {
  if (!clarification?.options.length) return null;
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  return (
    clarification.options.find(
      (option) =>
        normalized === normalizeText(option.id) ||
        normalized === normalizeText(option.label) ||
        (normalized === 'opcao a' && option.id === 'audience-a') ||
        (normalized === 'opcao b' && option.id === 'audience-b'),
    ) ?? null
  );
}

function mergeAudienceFilters(
  current: AudienceFilterSelection[],
  incoming: AudienceFilterSelection[],
): AudienceFilterSelection[] {
  if (!incoming.length) return dedupeAudienceFilters(current);
  const replacedQuestions = new Set(incoming.map((filter) => filter.questionId));
  return dedupeAudienceFilters([
    ...current.filter((filter) => !replacedQuestions.has(filter.questionId)),
    ...incoming,
  ]);
}

function selectAudienceCatalog(
  message: string,
  catalog: AudienceCatalogOption[],
  forceForCurrentQuestion = false,
): AudienceCatalogOption[] {
  if (!forceForCurrentQuestion && !mentionsAudience(message)) return [];

  const terms = tokenize(message);
  const dimensionPattern = /sexo|gener|idade|faixa|renda|escolar|ocup|regi|filh|relig|ra[cç]a|cor/i;
  const ranked = catalog
    .map((option) => {
      const searchable = `${option.question} ${option.questionOriginal ?? ''} ${option.option}`.toLocaleLowerCase('pt-BR');
      const termScore = terms.reduce(
        (score, term) => score + (searchable.includes(term) ? 3 : 0),
        0,
      );
      const profileScore = /perfil|publico/.test(option.category?.toLocaleLowerCase('pt-BR') ?? '') ? 1 : 0;
      const dimensionScore = dimensionPattern.test(option.question) ? 1 : 0;
      return { option, score: termScore + profileScore + dimensionScore };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (forceForCurrentQuestion) {
    const rankedIds = new Set(
      ranked.map((item) => `${item.option.questionId}:${item.option.optionId}`),
    );
    return [
      ...ranked.map((item) => item.option),
      ...catalog.filter(
        (option) => !rankedIds.has(`${option.questionId}:${option.optionId}`),
      ),
    ];
  }

  return ranked.length > 0 ? ranked.map((item) => item.option) : catalog;
}

function shouldUseAudienceCatalog(
  message: string,
  currentField: string | null,
  state: CampaignState,
  hasCatalogMatch: boolean,
): boolean {
  if (currentField === 'audienceDescription' || currentField === 'audienceConfirmation') {
    return true;
  }
  if (!state.audienceDescription) return false;

  // Estas respostas pertencem a outras etapas e não devem substituir a
  // descrição do público nem transformar palavras como "rádio" em um filtro
  // de consumo de mídia.
  if (['objective', 'location', 'category', 'selectedChannel'].includes(currentField ?? '')) {
    return false;
  }

  // Uma correspondência do próprio catálogo ou um marcador explícito de
  // público vence a heurística de orçamento/data. Isso permite frases como
  // "clientes com renda acima de 5 mil" sem perder o filtro de renda.
  if (hasCatalogMatch || mentionsAudience(message)) return true;
  if (currentField === 'maximumBudget') return !isBudgetOnlyAnswer(message);
  if (currentField === 'desiredStartDate') return !isDateOnlyAnswer(message);

  // Para qualquer pergunta não operacional, manter o catálogo disponível é
  // mais seguro que presumir que um filtro novo não existe.
  return true;
}

function isBudgetOnlyAnswer(message: string): boolean {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized || !/\d|\bmil\b|\bmilh(?:ao|oes)\b/.test(normalized)) return false;
  if (/public|pessoa|cliente|mulher|homem|femin|mascul|profiss|ocup|renda|filh|animal|pet/.test(normalized)) {
    return false;
  }

  const amount = String.raw`(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?:\s*(?:reais?|mil|milhao|milhoes))?`;
  return new RegExp(
    String.raw`^(?:(?:meu|minha)\s+)?(?:orcamento|investimento|teto|verba|valor)?\s*(?:(?:e|de|:)\s*)*${amount}\s*$`,
  ).test(normalized) || new RegExp(String.raw`^(?:ate|no maximo)\s+${amount}$`).test(normalized);
}

function isDateOnlyAnswer(message: string): boolean {
  const normalized = normalizeText(message).replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (/public|pessoa|cliente|mulher|homem|femin|mascul|profiss|ocup|renda|filh|animal|pet/.test(normalized)) {
    return false;
  }
  return /\b(?:hoje|amanha|dia|data|semana|mes|segunda|terca|quarta|quinta|sexta|sabado|domingo|rapido|breve|urgente)\b/.test(normalized)
    || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(normalized);
}

function mentionsAudience(message: string): boolean {
  const normalized = normalizeText(message);
  return /public|pessoa|perfil|alcanc|idade|anos|mulher|homem|femin|mascul|renda|classe|famili|interessad|cliente|autonom|ocup|profiss|filh|animal|pet|estimac|plano|saude|exerc|academ|agro|rural|relig|rac|etnia|escolar|ensino|midia|conteud|imovel|casa|automovel|carro|seguro|energia|governo|presidente|comprar/.test(
    normalized,
  );
}

function tokenize(message: string): string[] {
  const stopWords = new Set([
    'para',
    'meu',
    'minha',
    'com',
    'que',
    'uma',
    'uns',
    'umas',
    'dos',
    'das',
    'de',
    'do',
    'da',
    'e',
    'a',
    'o',
  ]);
  return normalizeText(message)
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function addPeriod(startDate: string, periodWeeks: number): string {
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(1, periodWeeks) * 7 - 1);
  return date.toISOString().slice(0, 10);
}
