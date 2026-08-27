import type { AudienceCatalogOption, AudienceFilterSelection } from './types.js';

type AudienceField =
  | 'filhos'
  | 'animais'
  | 'ocupacao'
  | 'renda'
  | 'idadeFaixas'
  | 'preferenciaConteudo'
  | 'consumoMidia'
  | 'escolaridade'
  | 'religiao'
  | 'corRaca'
  | 'regiao'
  | 'planoSaude'
  | 'atividadesFisicas'
  | 'seguroAutomovel'
  | 'agronegocio'
  | 'trabalhaEstudaFora'
  | 'diasSemanaRadio'
  | 'diasSemanaTv'
  | 'aprovaGestaoFederal'
  | 'pretendeComprarAuto'
  | 'pretendeComprarImovel'
  | 'tipoEnergiaResidencial'
  | 'diasSemanaMidia'
  | 'gender';

interface AudienceSelectionSummary {
  question: string;
  answers: string[];
  questionOriginal?: string;
}

const CANONICAL_VALUES: Partial<Record<AudienceField, string[]>> = {
  ocupacao: [
    'Empregado do setor privado',
    'Autônomo ou Profissional Liberal',
    'Empregador',
    'Empregado do setor público (inclusive empresas de economia mista)',
    'Aposentado e Pensionistas',
    'Estudante',
    'Do lar ou Trabalhador doméstico',
  ],
  preferenciaConteudo: [
    'Esporte',
    'Notícias',
    'Entretenimento',
    'Música',
    'Negócios',
    'Saúde',
    'Tecnologia',
    'Culinária',
    'Viagem',
    'Política',
  ],
  consumoMidia: [
    'Rádio AM/FM',
    'Streaming de Música',
    'TV Aberta',
    'TV a Cabo',
    'YouTube',
    'Instagram',
    'Facebook',
    'TikTok',
    'Podcast',
    'Jornal Online',
    'Portal de Notícias',
  ],
  escolaridade: [
    'Analfabeto',
    'Ensino Fundamental',
    'Ensino Médio',
    'Ensino Superior',
  ],
  tipoEnergiaResidencial: ['Da empresa equatorial', 'Painel Solar', 'Eólica', 'Outros'],
  aprovaGestaoFederal: ['Aprovo', 'Desaprovo'],
  pretendeComprarAuto: ['Sim', 'Talvez', 'Não'],
  pretendeComprarImovel: ['Sim', 'Talvez', 'Não'],
  diasSemanaMidia: ['Segunda à sexta', 'Sábado', 'Domingo'],
};

const INCOME_RANGES = [
  { min: 0, max: 2000, value: 'Até R$ 2.000' },
  { min: 2001, max: 5000, value: 'R$ 2.001 - R$ 5.000' },
  { min: 5001, max: 10000, value: 'R$ 5.001 - R$ 10.000' },
  { min: 10001, max: 20000, value: 'R$ 10.001 - R$ 20.000' },
  { min: 20001, max: Number.POSITIVE_INFINITY, value: 'Acima de R$ 20.000' },
];

const AGE_RANGES = [
  { min: 15, max: 20, value: '15-20' },
  { min: 21, max: 24, value: '21-24' },
  { min: 25, max: 29, value: '25-29' },
  { min: 30, max: 34, value: '30-34' },
  { min: 35, max: 39, value: '35-39' },
  { min: 40, max: 44, value: '40-44' },
  { min: 45, max: 49, value: '45-49' },
  { min: 50, max: 54, value: '50-54' },
  { min: 55, max: 59, value: '55-59' },
  { min: 60, max: 99, value: '60+' },
];

const CORE_GENDER_CATALOG: AudienceCatalogOption[] = [
  {
    questionId: 'core-demographic-sex',
    question: 'Sexo',
    category: 'core_demographic',
    optionId: 'core-demographic-sex-female',
    option: 'Feminino',
  },
  {
    questionId: 'core-demographic-sex',
    question: 'Sexo',
    category: 'core_demographic',
    optionId: 'core-demographic-sex-male',
    option: 'Masculino',
  },
];

const CORE_AGE_CATALOG: AudienceCatalogOption[] = [
  'Menor de 18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55+',
].map((option) => ({
  questionId: 'core-demographic-age',
  question: 'Faixa etária',
  category: 'core_demographic',
  optionId: `core-demographic-age-${normalize(option).replace(/[^a-z0-9]+/g, '-')}`,
  option,
}));

/**
 * Converte filtros dinâmicos do catálogo do services para o shape canônico
 * consumido pelo wizard de terceiros. Os IDs e a seleção original continuam
 * preservados em `audienceFilters` pelo caller.
 */
export function mapAudienceFiltersToTargetAudience(
  filters: AudienceFilterSelection[],
): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  const selections = new Map<string, AudienceSelectionSummary>();

  for (const filter of filters) {
    const question = filter.question.trim();
    const option = filter.option.trim();
    if (!question || !option) continue;

    const grouped = selections.get(filter.questionId) ?? {
      question,
      answers: [],
    };
    if (filter.questionOriginal && !grouped.questionOriginal) {
      grouped.questionOriginal = filter.questionOriginal;
    }
    if (!grouped.answers.includes(option)) grouped.answers.push(option);
    selections.set(filter.questionId, grouped);

    const field = resolveAudienceField(filter);
    if (!field) continue;
    const canonicalValue = canonicalizeValue(field, option);
    if (canonicalValue === null) continue;

    if (isSingleValueField(field)) {
      if (target[field] === undefined) target[field] = canonicalValue;
      continue;
    }

    const current = Array.isArray(target[field])
      ? (target[field] as string[])
      : [];
    if (!current.includes(canonicalValue)) {
      target[field] = [...current, canonicalValue];
    }
  }

  if (selections.size > 0) {
    target.selections = [...selections.values()].map(({ question, questionOriginal, answers }) => ({
      question,
      ...(questionOriginal ? { questionOriginal } : {}),
      answers,
    }));
  }

  return target;
}

/**
 * Provides a conservative deterministic fallback for common natural-language
 * expressions. The LLM remains the primary classifier. Dynamic dimensions are
 * restricted to the remote catalog; only the stable Services demographics
 * (sexo and faixa etária) have a local baseline for catalog outages.
 */
export function inferNaturalAudienceFilters(
  message: string,
  catalog: AudienceCatalogOption[],
): AudienceFilterSelection[] {
  const normalizedMessage = normalize(message);
  const wantsFemale = /\b(mulher|mulheres|feminina|feminino|femininas|femininos)\b/.test(
    normalizedMessage,
  );
  const wantsMale = /\b(homem|homens|masculina|masculino|masculinas|masculinos)\b/.test(
    normalizedMessage,
  );
  const ageConstraint = parseAgeConstraint(normalizedMessage);
  if (!wantsFemale && !wantsMale && !ageConstraint) return [];

  const inferred: AudienceFilterSelection[] = [];
  for (const option of withCoreDemographicCatalog(catalog)) {
    const field = resolveAudienceField(option);
    const optionText = normalize(option.option);

    if (
      field === 'gender' &&
      ((wantsFemale && /femin|mulher|female|^f$/.test(optionText)) ||
        (wantsMale && /mascul|homem|male|^m$/.test(optionText)))
    ) {
      inferred.push({
        questionId: option.questionId,
        question: option.question,
        ...(option.questionOriginal ? { questionOriginal: option.questionOriginal } : {}),
        ...(option.category !== undefined ? { category: option.category } : {}),
        optionId: option.optionId,
        option: option.option,
      });
      continue;
    }

    if (field === 'idadeFaixas' && ageConstraint) {
      const range = parseAgeRange(option.option);
      const matches =
        ageConstraint.mode === 'lessThan'
          ? Boolean(range && range.max < ageConstraint.value)
          : Boolean(range && range.min > ageConstraint.value);
      if (matches) {
        inferred.push({
          questionId: option.questionId,
          question: option.question,
          ...(option.questionOriginal ? { questionOriginal: option.questionOriginal } : {}),
          ...(option.category !== undefined ? { category: option.category } : {}),
          optionId: option.optionId,
          option: option.option,
        });
      }
    }
  }

  return dedupeSelections(inferred);
}

function withCoreDemographicCatalog(
  catalog: AudienceCatalogOption[],
): AudienceCatalogOption[] {
  const hasFemale = catalog.some((option) => {
    const optionText = normalize(option.option);
    return resolveAudienceField(option) === 'gender'
      && /femin|mulher|female|^f$/.test(optionText);
  });
  const hasMale = catalog.some((option) => {
    const optionText = normalize(option.option);
    return resolveAudienceField(option) === 'gender'
      && /mascul|homem|male|^m$/.test(optionText);
  });
  const hasAgeDimension = catalog.some(
    (option) => resolveAudienceField(option) === 'idadeFaixas',
  );

  return [
    ...catalog,
    ...CORE_GENDER_CATALOG.filter((option) =>
      option.option === 'Feminino' ? !hasFemale : !hasMale,
    ),
    ...(hasAgeDimension ? [] : CORE_AGE_CATALOG),
  ];
}

function resolveAudienceField(
  filter: Pick<AudienceFilterSelection, 'question' | 'questionOriginal'>,
): AudienceField | null {
  const searchable = normalize(`${filter.question} ${filter.questionOriginal ?? ''}`);

  if (/dias.*radio|radio.*dias/.test(searchable)) {
    return 'diasSemanaRadio';
  }
  if (/dias.*tv|tv.*dias/.test(searchable)) {
    return 'diasSemanaTv';
  }
  if (/trabalha\s+ou\s+estuda\s+fora/.test(searchable)) {
    return 'trabalhaEstudaFora';
  }
  if (/dia.*semana|segunda|terca|quarta|quinta|sexta|sabado|domingo/.test(searchable)) {
    return 'diasSemanaMidia';
  }
  if (/tipo.*energia|energia.*resid|painel solar|eolica/.test(searchable)) {
    return 'tipoEnergiaResidencial';
  }
  if (/comprar.*(auto|carro)|auto.*comprar|carro.*comprar/.test(searchable)) {
    return 'pretendeComprarAuto';
  }
  if (/comprar.*imovel|imovel.*comprar|casa.*comprar|apartamento.*comprar/.test(searchable)) {
    return 'pretendeComprarImovel';
  }
  if (/aprova.*gestao|gestao.*federal|governo|presidente/.test(searchable)) {
    return 'aprovaGestaoFederal';
  }
  if (/seguro.*(auto|carro)|auto.*seguro|carro.*seguro/.test(searchable)) {
    return 'seguroAutomovel';
  }
  if (/atividade.*fisica|pratica.*fisica|exercicio/.test(searchable)) {
    return 'atividadesFisicas';
  }
  if (/agro|agricul|rural/.test(searchable)) {
    return 'agronegocio';
  }
  if (/plano.*saude|saude.*plano/.test(searchable)) {
    return 'planoSaude';
  }
  if (/animal|pet|estima[cç][aã]o/.test(searchable)) {
    return 'animais';
  }
  if (/regiao|bairro/.test(searchable)) {
    return 'regiao';
  }
  if (/religi[aã]o/.test(searchable)) {
    return 'religiao';
  }
  if (/cor|ra[cç]a|etnia/.test(searchable)) {
    return 'corRaca';
  }
  if (/filh|crianca|cria[nñ]ca/.test(searchable)) {
    return 'filhos';
  }
  if (/sexo|genero/.test(searchable)) {
    return 'gender';
  }
  if (/ocup|profiss|empreg/.test(searchable)) {
    return 'ocupacao';
  }
  if (/escolar|instrucao|ensino/.test(searchable)) {
    return 'escolaridade';
  }
  if (/renda|salario|classe economica/.test(searchable)) {
    return 'renda';
  }
  if (/idade|faixa etaria|anos/.test(searchable)) {
    return 'idadeFaixas';
  }
  if (/consum.*midia|onde.*(ouve|assiste)|meio.*comunic|canal.*comunic/.test(searchable)) {
    return 'consumoMidia';
  }
  if (/conteudo|interess|programa|assunto/.test(searchable)) {
    return 'preferenciaConteudo';
  }
  return null;
}

function canonicalizeValue(field: AudienceField, value: string): string | null {
  const normalized = normalize(value);
  if (!normalized || normalized === 'indiferente') return null;

  if (isPillField(field)) {
    if (/^(sim|yes|possui|tem|concordo|aprovo)$/.test(normalized)) return 'sim';
    if (/^(nao|no|nao possui|nao tem|discordo|desaprovo)$/.test(normalized)) return 'nao';
    return null;
  }
  if (field === 'idadeFaixas') return canonicalAge(value);
  if (field === 'renda') return canonicalIncome(value);
  if (field === 'gender') return value;

  const canonicalValues = CANONICAL_VALUES[field];
  if (!canonicalValues) return value;
  const exact = canonicalValues.find((candidate) => normalize(candidate) === normalized);
  if (exact) return exact;

  const partial = canonicalValues.find((candidate) => {
    const candidateNormalized = normalize(candidate);
    return candidateNormalized.includes(normalized) || normalized.includes(candidateNormalized);
  });
  if (partial) return partial;

  // Mantém o valor validado do catálogo quando a administração cadastrou uma
  // variante nova; a seleção original ainda permite o cálculo remoto.
  return value;
}

function canonicalAge(value: string): string | null {
  const normalized = normalize(value);
  const numbers = parseNumbers(value);
  if (/menor\s+de\s+18/.test(normalized)) return 'Menor de 18';
  if (numbers.length >= 2) {
    const range = AGE_RANGES.find((item) => item.min === numbers[0] && item.max === numbers[1]);
    return range?.value ?? `${numbers[0]}-${numbers[1]}`;
  }
  if (numbers.length === 1 && /(mais|acima|\+)/.test(normalized)) {
    return `${numbers[0]}+`;
  }
  return null;
}

function canonicalIncome(value: string): string | null {
  const normalized = normalize(value);
  const numbers = parseNumbers(value);
  if (numbers.length >= 2) {
    const range = INCOME_RANGES.find(
      (item) => item.min === numbers[0] && item.max === numbers[1],
    );
    if (range) return range.value;
  }
  if (/(ate|menor).*(2000|2\.000)/.test(normalized)) return INCOME_RANGES[0]!.value;
  if (/(acima|mais).*(20\.000|20000)/.test(normalized)) return INCOME_RANGES[4]!.value;
  return findCanonicalValue('renda', value) ?? value;
}

function findCanonicalValue(field: AudienceField, value: string): string | null {
  const candidates = CANONICAL_VALUES[field];
  if (!candidates) return null;
  const normalized = normalize(value);
  return candidates.find((candidate) => normalize(candidate) === normalized) ?? null;
}

function isPillField(field: AudienceField): boolean {
  return [
    'filhos',
    'animais',
    'planoSaude',
    'atividadesFisicas',
    'seguroAutomovel',
    'agronegocio',
    'trabalhaEstudaFora',
  ].includes(field);
}

function isSingleValueField(field: AudienceField): boolean {
  return (
    isPillField(field) ||
    field === 'diasSemanaMidia' ||
    field === 'trabalhaEstudaFora' ||
    field === 'diasSemanaRadio' ||
    field === 'diasSemanaTv'
  );
}

function parseNumbers(value: string): number[] {
  return (value.match(/\d+(?:[.,]\d{3})*/g) ?? [])
    .map((item) => Number(item.replace(/\./g, '').replace(',', '.')))
    .filter((item) => Number.isFinite(item));
}

function parseAgeConstraint(
  value: string,
): { mode: 'lessThan' | 'greaterThan'; value: number } | null {
  const lessThan = value.match(/(?:menos|abaixo|inferior)\s*(?:de)?\s*(\d{2})/);
  if (lessThan?.[1]) {
    return { mode: 'lessThan', value: Number(lessThan[1]) };
  }
  const atMost = value.match(/ate\s*(?:os|as)?\s*(\d{2})/);
  if (atMost?.[1]) {
    return { mode: 'lessThan', value: Number(atMost[1]) + 1 };
  }
  const greaterThan = value.match(/(?:mais|acima|superior)\s*(?:de)?\s*(\d{2})/);
  if (greaterThan?.[1]) {
    return { mode: 'greaterThan', value: Number(greaterThan[1]) };
  }
  return null;
}

function parseAgeRange(value: string): { min: number; max: number } | null {
  const normalized = normalize(value);
  const numbers = parseNumbers(value);
  if (/menor\s+de\s+18/.test(normalized)) return { min: 0, max: 17 };
  if (numbers.length >= 2) {
    return { min: numbers[0]!, max: numbers[1]! };
  }
  if (numbers.length === 1 && /\+/.test(value)) {
    return { min: numbers[0]!, max: 99 };
  }
  return null;
}

function dedupeSelections(filters: AudienceFilterSelection[]): AudienceFilterSelection[] {
  const unique = new Map<string, AudienceFilterSelection>();
  for (const filter of filters) {
    unique.set(`${filter.questionId}:${filter.optionId}`, filter);
  }
  return [...unique.values()];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}
