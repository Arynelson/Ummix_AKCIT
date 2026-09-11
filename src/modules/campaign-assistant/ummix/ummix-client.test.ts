import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignState } from '../domain/types.js';
import {
  buildAudienceDemographics,
  countAudienceFilterDimensions,
  groupAudienceFilters,
  UmmixClient,
} from './ummix-client.js';

describe('Ummix audience impact payload', () => {
  it('counts the same audience dimensions as the manual wizard', () => {
    expect(
      countAudienceFilterDimensions({
        locations: [{ cityId: 'city-id', cityName: 'Goiânia', stateUf: 'GO' }],
        audienceFilters: [
          {
            questionId: 'gender-question',
            question: 'Sexo',
            optionId: 'female-option',
            option: 'Feminino',
          },
          {
            questionId: 'age-question',
            question: 'Faixa etária',
            optionId: 'age-option',
            option: '30-34',
          },
          {
            questionId: 'animals-question',
            question: 'Possui Animais de Estimação?',
            optionId: 'animals-option',
            option: 'Sim',
          },
        ],
      } as CampaignState),
    ).toBe(6);
  });

  it('materializes catalog gender and age filters in native demographic fields', () => {
    expect(
      buildAudienceDemographics({
        locations: [{ cityId: 'city-id', cityName: 'Goiânia', stateUf: 'GO' }],
        audienceFilters: [
          {
            questionId: 'gender-question',
            question: 'Gênero',
            optionId: 'female',
            option: 'Feminino',
          },
          {
            questionId: 'age-question',
            question: 'Faixa etária',
            optionId: 'age-30-34',
            option: '30-34',
          },
        ],
      } as CampaignState),
    ).toEqual({
      cidade: ['city-id'],
      sexo: ['Feminino'],
      faixasEtarias: [{ min: 30, max: 34 }],
    });
  });

  it('groups a dynamic services question while retaining the original label', () => {
    expect(
      groupAudienceFilters([
        {
          questionId: 'question-id',
          question: 'Preferência de conteúdo',
          questionOriginal: 'M1. Conteúdo preferido',
          optionId: 'option-id',
          option: 'Esporte',
        },
        {
          questionId: 'marital-status-question',
          question: 'Estado civil',
          questionOriginal: 'D1. Estado civil',
          optionId: 'single-option',
          option: 'Solteiro(a)',
        },
      ]),
    ).toEqual([
      {
        pergunta: 'Preferência de conteúdo',
        perguntaOriginal: 'M1. Conteúdo preferido',
        opcoes: ['Esporte'],
        operador: 'OR',
      },
      {
        pergunta: 'Estado civil',
        perguntaOriginal: 'D1. Estado civil',
        opcoes: ['Solteiro(a)'],
        operador: 'OR',
      },
    ]);
  });

  it('preserves the Services lower age band in native demographics', () => {
    expect(
      buildAudienceDemographics({
        locations: [{ cityId: 'city-id', cityName: 'Goiânia', stateUf: 'GO' }],
        audienceFilters: [
          {
            questionId: 'age-question',
            question: 'Faixa etária',
            optionId: 'age-under-18',
            option: 'Menor de 18',
          },
        ],
      } as CampaignState),
    ).toEqual({
      cidade: ['city-id'],
      faixasEtarias: [{ min: 0, max: 17 }],
    });
  });

  it('materializes every structural audience filter supported by Services', () => {
    expect(
      buildAudienceDemographics({
        locations: [{ cityId: 'city-id', cityName: 'Goiânia', stateUf: 'GO' }],
        audienceFilters: [
          {
            questionId: 'region-question',
            question: 'Região/Bairro',
            optionId: 'region-option',
            option: 'Norte',
          },
          {
            questionId: 'religion-question',
            question: 'Religião',
            optionId: 'religion-option',
            option: 'Católica',
          },
          {
            questionId: 'race-question',
            question: 'Cor/Raça',
            optionId: 'race-option',
            option: 'Branca',
          },
          {
            questionId: 'outside-question',
            question: 'Trabalha ou estuda fora da cidade?',
            optionId: 'outside-option',
            option: 'Sim',
          },
          {
            questionId: 'education-question',
            question: 'Escolaridade',
            optionId: 'education-option',
            option: 'Ensino Superior',
          },
          {
            questionId: 'income-question',
            question: 'Renda familiar',
            optionId: 'income-option',
            option: 'R$ 2.001 a R$ 5.000',
          },
          {
            questionId: 'occupation-question',
            question: 'Ocupação',
            optionId: 'occupation-option',
            option: 'Empresário',
          },
          {
            questionId: 'children-question',
            question: 'Possui filhos?',
            optionId: 'children-option',
            option: 'Sim',
          },
        ],
      } as CampaignState),
    ).toEqual({
      cidade: ['city-id'],
      regiao: ['Norte'],
      religiao: ['Católica'],
      corRaca: ['Branca'],
      trabalhaEstudaFora: [true],
      escolaridade: ['Ensino Superior'],
      renda: ['R$ 2.001 - R$ 5.000'],
      ocupacao: ['Empresário'],
      possuiFilhos: true,
    });
  });

  it('envia apenas perguntas EAV nas respostas genéricas', () => {
    expect(
      groupAudienceFilters([
        {
          questionId: 'gender-question',
          question: 'Sexo',
          questionOriginal: 'V3.2. Sexo',
          optionId: 'female-option',
          option: 'Feminino',
        },
        {
          questionId: 'dynamic-question',
          question: 'Qual esporte acompanha?',
          questionOriginal: 'S2. Esporte acompanhado',
          optionId: 'football-option',
          option: 'Futebol',
        },
      ]),
    ).toEqual([
      {
        pergunta: 'Qual esporte acompanha?',
        perguntaOriginal: 'S2. Esporte acompanhado',
        opcoes: ['Futebol'],
        operador: 'OR',
      },
    ]);
  });
});

describe('Ummix audience catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps audience questions in campaign_creation while excluding operational questions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'age-question',
            title: 'Faixa etária',
            category: 'perfil_habitos',
            stage: 'campaign_creation',
            type: 'single_choice',
            options: [{ id: 'age-option', text: '25 a 29' }],
          },
          {
            id: 'city-question',
            title: 'Selecione a Cidade',
            category: 'alcance_campanha',
            stage: 'campaign_creation',
            type: 'single_choice',
            options: [{ id: 'city-option', text: 'Goiânia' }],
          },
          {
            id: 'channel-question',
            title: 'Escolha Rádio ou TV',
            category: 'alcance_campanha',
            stage: 'campaign_creation',
            type: 'single_choice',
            options: [{ id: 'radio-option', text: 'Rádio' }],
          },
          {
            id: 'marital-status-question',
            title: 'Estado civil',
            category: 'perfil',
            stage: 'auto_preenchimento',
            type: 'single_choice',
            options: [{ id: 'single-option', text: 'Solteiro(a)' }],
          },
          {
            id: 'marital-status-inform-question',
            title: 'Informe seu estado civil',
            category: 'perfil_habitos',
            stage: 'auto_preenchimento',
            type: 'single_choice',
            options: [{ id: 'married-option', text: 'Casado(a)' }],
          },
          {
            id: 'radio-consumption-question',
            title: 'Com que frequência você ouve rádio?',
            category: 'midia',
            stage: 'auto_preenchimento',
            type: 'single_choice',
            options: [{ id: 'daily-option', text: 'Todos os dias' }],
          },
          {
            id: 'income-question',
            title: 'Renda familiar mensal',
            category: 'socioeconomico',
            stage: 'auto_preenchimento',
            type: 'number',
            options: [{ id: 'income-option', text: 'R$ 2.000 - R$ 5.000' }],
          },
        ],
      }),
    );

    const catalog = await new UmmixClient(
      'https://services.test',
      'integration-service-token',
    ).getAudienceCatalog('user-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://services.test/questions/user/active',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
          'x-service-token': 'integration-service-token',
        }),
      }),
    );

    expect(catalog).toEqual([
      {
        questionId: 'age-question',
        question: 'Faixa etária',
        category: 'perfil_habitos',
        optionId: 'age-option',
        option: '25 a 29',
      },
      {
        questionId: 'marital-status-question',
        question: 'Estado civil',
        category: 'perfil',
        optionId: 'single-option',
        option: 'Solteiro(a)',
      },
      {
        questionId: 'marital-status-inform-question',
        question: 'Informe seu estado civil',
        category: 'perfil_habitos',
        optionId: 'married-option',
        option: 'Casado(a)',
      },
      {
        questionId: 'radio-consumption-question',
        question: 'Com que frequência você ouve rádio?',
        category: 'midia',
        optionId: 'daily-option',
        option: 'Todos os dias',
      },
      {
        questionId: 'income-question',
        question: 'Renda familiar mensal',
        category: 'socioeconomico',
        optionId: 'income-option',
        option: 'R$ 2.000 - R$ 5.000',
      },
    ]);
  });

  it('preserves stable field metadata for newly added segmentation questions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'health-question',
            title: 'Plano de saúde',
            category: 'perfil_habitos',
            config: {
              fieldKey: 'plano_saude',
              originalExcelColumn: 'S1. Você possui algum plano de saúde privado?',
            },
            options: [{ id: 'health-option', text: 'Sim' }],
          },
          {
            id: 'energy-question',
            title: 'Energia residencial',
            category: 'perfil_habitos',
            config: { slug: 'tipo_energia_residencial' },
            options: [{ id: 'energy-option', text: 'Painel Solar' }],
          },
        ],
      }),
    );

    const catalog = await new UmmixClient(
      'https://services.test',
      'integration-service-token',
    ).getAudienceCatalog('user-token');

    expect(catalog).toEqual([
      expect.objectContaining({
        questionId: 'health-question',
        questionOriginal: 'S1. Você possui algum plano de saúde privado?',
        fieldKey: 'plano_saude',
      }),
      expect.objectContaining({
        questionId: 'energy-question',
        fieldKey: 'tipo_energia_residencial',
      }),
    ]);
  });
});

describe('Ummix audience impact diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs weighted impacts separately from the upstream respondent count', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/campaigns/calculate')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              suggestedFrequency: 66,
              suggestedPeriod: 4,
              cpm: 100,
              totalImpressions: 10000,
              inventory: 151,
              projectedLeads: 10,
              projectedSales: 1,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalImpactos: 123456.75,
            totalRespondentes: 9876,
            filtrosAplicados: [{ pergunta: 'Sexo' }],
          }),
        };
      }),
    );

    const comparison = await new UmmixClient(
      'https://services.test',
      'integration-service-token',
      logger,
    ).compareChannels('user-token', {
      objective: 'reconhecimento_marca',
      category: 'varejo',
      brandStrength: 'regional',
      durationSeconds: 15,
      maximumBudget: 1000,
      locations: [{ cityId: 'city-id', cityName: 'Goiânia', stateUf: 'GO' }],
      audienceFilters: [],
    } as CampaignState);

    expect(comparison.radio.audienceImpacts).toBe(123456.75);
    expect(comparison.tv.audienceImpacts).toBe(123456.75);
    const resultLogs = logger.info.mock.calls
      .map(([bindings, message]) => ({ bindings, message }))
      .filter(({ bindings }) => bindings.diagnostic === 'campaign-assistant-audience-impact-result');

    expect(resultLogs).toHaveLength(2);
    expect(resultLogs[0]).toMatchObject({
      bindings: {
        totalImpacts: 123456.75,
        upstreamRespondents: 9876,
        appliedFilterCount: 1,
      },
    });
  });
});

describe('Ummix campaign update diagnostics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs the persisted audience shape without logging audience values', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const response = {
      id: 'campaign-id',
      targetAudience: {
        cidade: ['Goiânia'],
        gender: ['Feminino'],
        sexo: ['Feminino'],
        idadeFaixas: ['21-24'],
        audienceFilters: [{ questionId: 'age-question', option: '21-24' }],
        selections: [{ question: 'Faixa etária', answers: ['21-24'] }],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new UmmixClient(
      'https://services.test',
      'integration-service-token',
      logger,
    ).updateCampaign(
      'user-token',
      'campaign-id',
      { targetAudience: response.targetAudience },
    );

    expect(result).toEqual(response);
    const responseLog = logger.info.mock.calls
      .map(([bindings, message]) => ({ bindings, message }))
      .find(({ bindings }) => bindings.diagnostic === 'campaign-assistant-finalization-upstream-response');

    expect(responseLog).toMatchObject({
      bindings: {
        diagnostic: 'campaign-assistant-finalization-upstream-response',
        responseType: 'object',
        responseTargetAudienceFound: true,
        responseTargetAudienceKeys: expect.arrayContaining([
          'audienceFilters',
          'cidade',
          'gender',
          'idadeFaixas',
          'selections',
          'sexo',
        ]),
        persistedHasGender: true,
        persistedAgeFilterCount: 1,
        persistedAudienceFilterCount: 1,
        persistedSelectionCount: 1,
      },
    });
    expect(JSON.stringify(responseLog)).not.toContain('Feminino');
    expect(JSON.stringify(responseLog)).not.toContain('21-24');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://services.test/campaigns/campaign-id',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
        }),
      }),
    );
  });
});
