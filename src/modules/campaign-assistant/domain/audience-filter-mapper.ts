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
  | 'tipoImovel'
  | 'valorImovel'
  | 'tipoAutomovel'
  | 'categoriaAutomovel'
  | 'valorAutomovel'
  | 'modalidadeAgro'
  | 'gender';

interface AudienceSelectionSummary {
  question: string;
  answers: string[];
  questionOriginal?: string;
  fieldKey?: string;
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
  tipoImovel: [
    'Casa',
    'Apartamento',
    'Terreno',
    'Imóvel comercial',
    'Imóvel em condomínio fechado',
    'Outro',
  ],
  valorImovel: [
    'até R$ 250.000,00',
    'de R$ 250.000,00 + 1 a R$ 500.000,00',
    'de 500.000 +1 a R$ 1.000.000,00',
    'acima de R$ 1.000.001,00',
  ],
  tipoAutomovel: ['Novo', 'Usado', 'Não se decidiu'],
  categoriaAutomovel: [
    'Motocicleta',
    'Veículo a combustão (gasolina/álcool/diesel)',
    'Veículo híbrido ou elétrico',
    'Outro',
  ],
  valorAutomovel: [
    'até R$ 50.000,00',
    'de R$ 50.001,00 a R$ 80.000,00',
    'de 80.001,00 a R$ 150.000,00',
    'de 150.001,00 a R$ 300.000,00',
    'acima de R$ 300.001,00',
  ],
  modalidadeAgro: [
    'Produtor rural',
    'Funcionário do setor',
    'Familiar envolvido',
    'Consumo regular de produtos do agro local',
  ],
};

// O admin pode informar uma chave estável no catálogo sem depender do texto
// visível da pergunta. Somente chaves conhecidas entram no shape estruturado;
// qualquer chave nova ou desconhecida continua sendo enviada como resposta
// genérica e allowlistada pelo catálogo remoto.
const FIELD_KEY_ALIASES: Record<string, AudienceField> = {
  sexo: 'gender',
  genero: 'gender',
  gender: 'gender',
  idade: 'idadeFaixas',
  idadefaixa: 'idadeFaixas',
  idadefaixas: 'idadeFaixas',
  faixaetaria: 'idadeFaixas',
  faixaetarias: 'idadeFaixas',
  possuifilhos: 'filhos',
  filhos: 'filhos',
  possuianimais: 'animais',
  possuianimaisdeestimacao: 'animais',
  animaisdeestimacao: 'animais',
  pets: 'animais',
  animais: 'animais',
  animal: 'animais',
  ocupacao: 'ocupacao',
  profissao: 'ocupacao',
  renda: 'renda',
  preferenciadeconteudo: 'preferenciaConteudo',
  preferenciaconteudo: 'preferenciaConteudo',
  consumomidia: 'consumoMidia',
  escolaridade: 'escolaridade',
  religiao: 'religiao',
  corraca: 'corRaca',
  cor: 'corRaca',
  raca: 'corRaca',
  regiao: 'regiao',
  regioes: 'regiao',
  planosaude: 'planoSaude',
  atividadesfisicas: 'atividadesFisicas',
  seguroautomovel: 'seguroAutomovel',
  agronegocio: 'agronegocio',
  trabalhaestudafora: 'trabalhaEstudaFora',
  trabalhaouestudafora: 'trabalhaEstudaFora',
  diasemanaradio: 'diasSemanaRadio',
  diasemanatv: 'diasSemanaTv',
  diasemanamidia: 'diasSemanaMidia',
  aprovagestaofederal: 'aprovaGestaoFederal',
  pretendecomprarauto: 'pretendeComprarAuto',
  pretendecomprarautomovel: 'pretendeComprarAuto',
  pretendecomprarimovel: 'pretendeComprarImovel',
  tipoenergiaresidencial: 'tipoEnergiaResidencial',
  tipoimovel: 'tipoImovel',
  valorimovel: 'valorImovel',
  tipoautomovel: 'tipoAutomovel',
  categoriaautomovel: 'categoriaAutomovel',
  valorautomovel: 'valorAutomovel',
  modalidadeagro: 'modalidadeAgro',
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
  { min: 0, max: 17, value: 'Menor de 18' },
  ...AGE_RANGES,
].map(({ value }) => ({
  questionId: 'core-demographic-age',
  question: 'Faixa etária',
  category: 'core_demographic',
  optionId: `core-demographic-age-${normalize(value).replace(/[^a-z0-9]+/g, '-')}`,
  option: value,
}));

const CORE_OCCUPATION_CATALOG: AudienceCatalogOption[] = [
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-private-sector',
    option: 'Empregado do setor privado',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-self-employed',
    option: 'Autônomo ou Profissional Liberal',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-employer',
    option: 'Empregador',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-public-sector',
    option: 'Empregado do setor público (inclusive empresas de economia mista)',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-retired',
    option: 'Aposentado e Pensionistas',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-student',
    option: 'Estudante',
  },
  {
    questionId: 'core-demographic-occupation',
    question: 'Ocupação',
    category: 'core_demographic',
    optionId: 'core-demographic-occupation-domestic',
    option: 'Do lar ou Trabalhador doméstico',
  },
];

type AgeConstraint =
  | { mode: 'lessThan' | 'greaterThan' | 'atLeast' | 'exact'; value: number }
  | { mode: 'between'; value: number; upperValue: number };

const NATURAL_STOP_WORDS = new Set([
  'a',
  'as',
  'ao',
  'aos',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'ou',
  'para',
  'por',
  'que',
  'sem',
  'um',
  'uma',
  'uns',
  'umas',
]);

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
    if (filter.fieldKey && !grouped.fieldKey) {
      grouped.fieldKey = filter.fieldKey;
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

  // O wizard legado ainda lê `gender`, enquanto alguns pontos da API e do
  // resumo usam `sexo`. Enviar os dois aliases evita que a seleção se perca
  // ao atravessar a fronteira entre a plataforma AI e o wizard.
  if (target.gender !== undefined && target.sexo === undefined) {
    target.sexo = target.gender;
  }

  if (selections.size > 0) {
    target.selections = [...selections.values()].map(({ question, questionOriginal, fieldKey, answers }) => ({
      question,
      ...(questionOriginal ? { questionOriginal } : {}),
      ...(fieldKey ? { fieldKey } : {}),
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
  const ageConstraint = /\b(idade|idades|ano|anos|jovem|jovens|adulto|adultos|idoso|idosos|crianca|criancas)\b/.test(
    normalizedMessage,
  )
    ? parseAgeConstraint(normalizedMessage)
    : null;

  const inferred: AudienceFilterSelection[] = [];
  for (const option of withCoreDemographicCatalog(catalog)) {
    // A parte administrativa do Services ainda não publica fieldKey para
    // todas as perguntas. Quando isso ocorre, o próprio valor da opção pode
    // revelar a dimensão (por exemplo, "Autônomo" ou "Feminino"). Isso
    // mantém o catálogo remoto como fonte de verdade sem depender de IDs ou
    // de uma lista fixa de filtros no frontend.
    const field = resolveAudienceField(option) ?? inferFieldFromOptionText(option.option);
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
        ...(option.fieldKey ? { fieldKey: option.fieldKey } : {}),
        ...(option.category !== undefined ? { category: option.category } : {}),
        optionId: option.optionId,
        option: option.option,
      });
      continue;
    }

    if (field === 'idadeFaixas') {
      const range = parseAgeRange(option.option);
      const matches = ageConstraint
        ? matchesAgeConstraint(range, ageConstraint)
        : matchesNaturalAgeOption(normalizedMessage, range);
      if (matches) {
        inferred.push({
          questionId: option.questionId,
          question: option.question,
          ...(option.questionOriginal ? { questionOriginal: option.questionOriginal } : {}),
          ...(option.fieldKey ? { fieldKey: option.fieldKey } : {}),
          ...(option.category !== undefined ? { category: option.category } : {}),
          optionId: option.optionId,
          option: option.option,
        });
      }
      continue;
    }

    if (field !== 'gender' && matchesNaturalCatalogOption(normalizedMessage, option, field)) {
      inferred.push({
        questionId: option.questionId,
        question: option.question,
        ...(option.questionOriginal ? { questionOriginal: option.questionOriginal } : {}),
        ...(option.fieldKey ? { fieldKey: option.fieldKey } : {}),
        ...(option.category !== undefined ? { category: option.category } : {}),
        optionId: option.optionId,
        option: option.option,
      });
    }
  }

  return dedupeSelections(inferred);
}

function matchesNaturalAgeOption(
  message: string,
  range: { min: number; max: number } | null,
): boolean {
  if (!range) return false;
  if (/crianc|menor/.test(message)) return range.max < 18;
  if (/adolesc/.test(message)) return range.min < 18;
  if (/jovem/.test(message)) return range.min >= 15 && range.max <= 34;
  if (/adult/.test(message)) return range.min >= 18;
  if (/idos|terceira idade/.test(message)) return range.min >= 60;
  return false;
}

function matchesAgeConstraint(
  range: { min: number; max: number } | null,
  constraint: AgeConstraint,
): boolean {
  if (!range) return false;
  switch (constraint.mode) {
    case 'lessThan':
      return range.max < constraint.value;
    case 'greaterThan':
      return range.min > constraint.value;
    case 'atLeast':
      return range.min >= constraint.value;
    case 'exact':
      return range.min <= constraint.value && range.max >= constraint.value;
    case 'between':
      return range.min >= constraint.value && range.max <= constraint.upperValue;
  }
}

function matchesNaturalCatalogOption(
  normalizedMessage: string,
  option: AudienceCatalogOption,
  field: AudienceField | null,
): boolean {
  if (!field) {
    // "Sim", "Não" e equivalentes aparecem em várias perguntas do
    // catálogo. Sem a dimensão da pergunta, selecionar essa opção atribui a
    // mesma resposta a várias perguntas diferentes (principalmente quando o
    // cliente está apenas confirmando uma etapa do fluxo).
    if (isAmbiguousBooleanOption(option.option)) return false;
    return [option.option, ...genericNaturalAliases(option.option)].some((candidate) =>
      containsNaturalPhrase(normalizedMessage, candidate),
    );
  }

  if (isBooleanChoiceField(field)) {
    return matchesBooleanOption(normalizedMessage, field, option.option);
  }

  if (field === 'renda') {
    const incomeMatch = matchesIncomeConstraint(normalizedMessage, option.option);
    if (incomeMatch !== null) return incomeMatch;
  }

  return [option.option, ...naturalAliases(field, normalize(option.option))].some((candidate) =>
    containsNaturalPhrase(normalizedMessage, candidate),
  );
}

/**
 * Compara uma opção do catálogo com uma frase livre sem transformar todo o
 * texto do cliente em filtros. A comparação exige palavras significativas e
 * permite apenas uma flexão simples no final da palavra (ex.: "mulheres" /
 * "mulher"). O LLM continua responsável por relações semânticas ambíguas;
 * este caminho cobre o vocabulário explícito de um catálogo allowlistado.
 */
function containsNaturalPhrase(message: string, candidate: string): boolean {
  const normalizedCandidate = normalize(candidate).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalizedCandidate) return false;

  const normalizedMessage = normalize(message).replace(/[^a-z0-9]+/g, ' ').trim();
  const candidateTokens = normalizedCandidate
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !NATURAL_STOP_WORDS.has(token));
  if (candidateTokens.length === 0) return false;

  if (normalizedMessage.includes(normalizedCandidate)) return true;
  const messageTokens = normalizedMessage.split(/\s+/);
  return candidateTokens.every((candidateToken) => {
    const stem = candidateToken.length >= 5 ? candidateToken.slice(0, -1) : candidateToken;
    return messageTokens.some(
      (messageToken) =>
        messageToken === candidateToken ||
        (stem.length >= 4 && messageToken.startsWith(stem)),
    );
  });
}

function isBooleanChoiceField(field: AudienceField): boolean {
  return isPillField(field) || [
    'aprovaGestaoFederal',
    'pretendeComprarAuto',
    'pretendeComprarImovel',
  ].includes(field);
}

function matchesBooleanOption(
  message: string,
  field: AudienceField,
  option: string,
): boolean {
  const normalizedOption = normalize(option);
  const canonical = canonicalizeValue(field, option);
  const positiveMatch = positiveAliases(field).some(
    (alias) => containsNaturalPhrase(message, alias) && !isNegatedNaturalPhrase(message, alias),
  );
  const negativeMatch =
    negativeAliases(field).some((alias) => containsNaturalPhrase(message, alias)) ||
    positiveAliases(field).some(
      (alias) => containsNaturalPhrase(message, alias) && isNegatedNaturalPhrase(message, alias),
    );
  if (
    canonical === 'sim' ||
    normalize(String(canonical ?? '')) === 'sim' ||
    (field === 'aprovaGestaoFederal' && normalizedOption === 'aprovo')
  ) {
    return positiveMatch;
  }
  if (
    canonical === 'nao' ||
    normalize(String(canonical ?? '')) === 'nao' ||
    (field === 'aprovaGestaoFederal' && normalizedOption === 'desaprovo')
  ) {
    return negativeMatch;
  }
  if (normalizedOption === 'talvez') {
    return /\b(talvez|possivelmente|pode ser|ainda nao sei|nao decidiu)\b/.test(message);
  }
  return false;
}

function isAmbiguousBooleanOption(value: string): boolean {
  return new Set([
    'sim',
    'nao',
    's',
    'n',
    'yes',
    'no',
    'talvez',
    'indiferente',
    'nao informado',
  ]).has(normalize(value).replace(/\s+/g, ' ').trim());
}

function isNegatedNaturalPhrase(message: string, candidate: string): boolean {
  const normalizedMessage = normalize(message).replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedCandidate = normalize(candidate).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!normalizedMessage || !normalizedCandidate) return false;

  const directIndex = normalizedMessage.indexOf(normalizedCandidate);
  if (directIndex >= 0) {
    return /\b(nao|sem|nunca|nem|jamais)\b/.test(
      normalizedMessage.slice(Math.max(0, directIndex - 32), directIndex),
    );
  }

  const candidateLastToken = normalizedCandidate.split(/\s+/).at(-1);
  if (!candidateLastToken) return false;
  const candidateStem = candidateLastToken.length >= 5
    ? candidateLastToken.slice(0, -1)
    : candidateLastToken;
  const messageTokens = normalizedMessage.split(/\s+/);
  return messageTokens.some((token, index) => {
    const matches = token === candidateLastToken ||
      (candidateStem.length >= 4 && token.startsWith(candidateStem));
    if (!matches) return false;
    return /\b(nao|sem|nunca|nem|jamais)\b/.test(
      messageTokens.slice(Math.max(0, index - 4), index).join(' '),
    );
  });
}

function positiveAliases(field: AudienceField): string[] {
  switch (field) {
    case 'filhos':
      return ['filho', 'filhos', 'filha', 'filhas', 'mae', 'maes', 'pai', 'pais', 'maternidade'];
    case 'animais':
      return ['animal de estimacao', 'animais de estimacao', 'pet', 'pets', 'cachorro', 'gato'];
    case 'planoSaude':
      return ['plano de saude', 'convenio medico', 'convenio de saude', 'unimed', 'amil'];
    case 'atividadesFisicas':
      return ['atividade fisica', 'atividades fisicas', 'exercicio', 'academia', 'treino'];
    case 'seguroAutomovel':
      return ['seguro do carro', 'seguro automovel', 'seguro auto', 'seguro veicular'];
    case 'agronegocio':
      return ['agronegocio', 'agro', 'agricultor', 'produtor rural', 'fazenda', 'rural'];
    case 'trabalhaEstudaFora':
      return ['trabalha fora', 'estuda fora', 'fora da cidade', 'cidade vizinha', 'desloca para outra cidade'];
    case 'aprovaGestaoFederal':
      return ['aprovo', 'aprova o governo', 'concordo com o governo', 'boa gestao'];
    case 'pretendeComprarAuto':
      return ['quer comprar carro', 'pretende comprar carro', 'comprar automovel', 'comprar veiculo', 'comprar moto'];
    case 'pretendeComprarImovel':
      return ['quer comprar imovel', 'pretende comprar imovel', 'comprar casa', 'comprar apartamento', 'comprar terreno'];
    default:
      return [];
  }
}

function negativeAliases(field: AudienceField): string[] {
  switch (field) {
    case 'filhos':
      return ['sem filhos', 'nao tem filhos', 'nao possui filhos'];
    case 'animais':
      return ['sem animais', 'nao tem animais', 'nao possui animais'];
    case 'planoSaude':
      return ['sem plano de saude', 'nao tem plano de saude', 'nao possui plano de saude'];
    case 'atividadesFisicas':
      return ['nao pratica atividade fisica', 'sedentario', 'sedentaria'];
    case 'seguroAutomovel':
      return ['sem seguro de carro', 'nao tem seguro auto', 'nao possui seguro automovel'];
    case 'agronegocio':
      return ['nao trabalha com agro', 'nao e ligado ao agronegocio', 'sem relacao com o agro'];
    case 'trabalhaEstudaFora':
      return ['nao trabalha fora', 'nao estuda fora', 'dentro da propria cidade'];
    case 'aprovaGestaoFederal':
      return ['nao aprovo', 'desaprovo', 'nao concordo com o governo'];
    case 'pretendeComprarAuto':
      return ['nao quer comprar carro', 'nao pretende comprar carro', 'nao vai comprar carro'];
    case 'pretendeComprarImovel':
      return ['nao quer comprar imovel', 'nao pretende comprar imovel', 'nao vai comprar casa'];
    default:
      return [];
  }
}

function naturalAliases(field: AudienceField, option: string): string[] {
  switch (field) {
    case 'ocupacao':
      if (/autonom|profissional liberal/.test(option)) {
        return [
          'autonomo',
          'autonoma',
          'autonomos',
          'autonomas',
          'profissional autonomo',
          'profissionais autonomos',
          'profissional liberal',
          'profissionais liberais',
          'por conta propria',
          'freelancer',
];

      }
      if (/setor privado/.test(option)) return ['empresa privada', 'iniciativa privada', 'carteira assinada'];
      if (/setor publico/.test(option)) return ['servidor publico', 'funcionario publico', 'concursado'];
      if (/aposentado/.test(option)) return ['aposentado', 'aposentada', 'pensionista'];
      if (/estudante/.test(option)) return ['estudante', 'universitario', 'faculdade'];
      if (/lar|domestico/.test(option)) return ['do lar', 'domestica', 'dona de casa'];
      if (/empregador/.test(option)) return ['empresario', 'dono de empresa', 'dono de negocio'];
      return [];
    case 'preferenciaConteudo':
      if (/esporte/.test(option)) return ['esporte', 'esportes', 'futebol', 'basquete'];
      if (/noticia/.test(option)) return ['noticia', 'noticias', 'noticiario', 'informacao'];
      if (/entretenimento/.test(option)) return ['entretenimento', 'filmes', 'series', 'novelas'];
      if (/musica/.test(option)) return ['musica', 'musicas', 'show', 'shows'];
      if (/negocio/.test(option)) return ['negocios', 'empreendedorismo', 'empreendedor'];
      if (/saude/.test(option)) return ['saude', 'bem estar', 'qualidade de vida'];
      if (/tecnologia/.test(option)) return ['tecnologia', 'tecnologico', 'tech', 'inovacao'];
      if (/culinaria/.test(option)) return ['culinaria', 'receitas', 'cozinha'];
      if (/viagem/.test(option)) return ['viagem', 'turismo', 'viajar'];
      if (/politica/.test(option)) return ['politica', 'eleicoes', 'eleicao'];
      return [];
    case 'consumoMidia':
      if (/radio/.test(option)) return ['radio', 'ouvir radio', 'ouve radio'];
      if (/streaming/.test(option)) return ['streaming', 'spotify', 'deezer'];
      if (/tv aberta/.test(option)) return ['televisao aberta', 'tv aberta', 'assistir tv'];
      if (/tv a cabo/.test(option)) return ['televisao por assinatura', 'tv por assinatura', 'tv a cabo'];
      if (/youtube/.test(option)) return ['youtube', 'videos no youtube'];
      if (/instagram/.test(option)) return ['instagram'];
      if (/facebook/.test(option)) return ['facebook'];
      if (/tiktok/.test(option)) return ['tiktok'];
      if (/podcast/.test(option)) return ['podcast', 'podcasts'];
      if (/jornal online/.test(option)) return ['jornal online', 'jornal na internet'];
      if (/portal de noticias/.test(option)) return ['portal de noticias', 'site de noticias'];
      return [];
    case 'escolaridade':
      if (/fundamental/.test(option)) return ['ensino fundamental', 'fundamental'];
      if (/medio/.test(option)) return ['ensino medio', 'colegial'];
      if (/superior/.test(option)) return ['ensino superior', 'faculdade', 'universidade', 'graduado'];
      if (/analfabeto/.test(option)) return ['analfabeto', 'nao sabe ler'];
      return [];
    case 'religiao':
      if (/catolic/.test(option)) return ['catolico', 'catolica', 'catolicismo'];
      if (/evangel|protest/.test(option)) return ['evangelico', 'evangelica', 'protestante'];
      if (/espirit/.test(option)) return ['espirita', 'espiritismo'];
      if (/ateu/.test(option)) return ['ateu', 'atea', 'sem religiao'];
      if (/umbanda/.test(option)) return ['umbanda'];
      if (/candomble/.test(option)) return ['candomble'];
      return [];
    case 'corRaca':
      if (/branc/.test(option)) return ['branco', 'branca'];
      if (/pret|neg/.test(option)) return ['preto', 'preta', 'negro', 'negra'];
      if (/pard/.test(option)) return ['pardo', 'parda'];
      if (/amarel/.test(option)) return ['amarelo', 'amarela'];
      if (/indigen/.test(option)) return ['indigena'];
      return [];
    case 'tipoEnergiaResidencial':
      if (/solar/.test(option)) return ['energia solar', 'painel solar'];
      if (/eolic/.test(option)) return ['energia eolica', 'eolica'];
      if (/equatorial/.test(option)) return ['energia da equatorial', 'equatorial'];
      return [];
    case 'diasSemanaMidia':
      if (/segunda.*sexta/.test(option)) return ['durante a semana', 'dias uteis', 'segunda a sexta'];
      if (/sabado/.test(option)) return ['sabado', 'aos sabados'];
      if (/domingo/.test(option)) return ['domingo', 'aos domingos'];
      return [];
    case 'tipoImovel':
      if (/casa/.test(option)) return ['casa', 'casas'];
      if (/apartamento/.test(option)) return ['apartamento', 'apartamentos', 'apto'];
      if (/terreno/.test(option)) return ['terreno', 'lote'];
      if (/imovel comercial/.test(option)) return ['imovel comercial', 'ponto comercial', 'sala comercial'];
      if (/condominio/.test(option)) return ['condominio fechado', 'apartamento em condominio', 'casa em condominio'];
      return [];
    case 'valorImovel':
      return moneyRangeAliases(option, 'imovel');
    case 'tipoAutomovel':
      if (/novo/.test(option)) return ['novo', 'zero km', '0 km'];
      if (/usado/.test(option)) return ['usado', 'seminovo', 'semi novo'];
      if (/nao se decidiu/.test(option)) return ['nao decidi', 'ainda nao decidi', 'nao sei qual'];
      return [];
    case 'categoriaAutomovel':
      if (/motocicleta/.test(option)) return ['motocicleta', 'moto'];
      if (/combustao/.test(option)) return ['carro a combustao', 'gasolina', 'alcool', 'diesel'];
      if (/hibrido|eletrico/.test(option)) return ['hibrido', 'eletrico', 'carro eletrico'];
      return [];
    case 'valorAutomovel':
      return moneyRangeAliases(option, 'automovel');
    case 'modalidadeAgro':
      if (/produtor rural/.test(option)) return ['produtor rural', 'fazendeiro', 'agricultor'];
      if (/funcionario/.test(option)) return ['funcionario do setor', 'trabalha no agro'];
      if (/familiar/.test(option)) return ['familia trabalha no agro', 'familiar envolvido'];
      if (/consumo regular/.test(option)) return ['consome produtos do agro', 'produtos do agro'];
      return [];
    default:
      return [];
  }
}

function moneyRangeAliases(option: string, subject: 'imovel' | 'automovel'): string[] {
  const numbers = parseMoneyNumbers(option);
  const prefix = subject === 'imovel' ? 'imovel' : 'carro';
  if (numbers.length === 0) return [];
  const first = numbers[0]!;
  const firstShort = formatMoneyShort(first);
  const normalized = normalize(option);
  if (/(^|\s)ate\b/.test(normalized)) {
    return [
      `ate ${firstShort}`,
      `ate ${prefix} de ${firstShort}`,
      `no maximo ${firstShort}`,
    ];
  }
  if (numbers.length === 1) {
    return [`acima de ${firstShort}`, `${firstShort} ou mais`, `${prefix} de ${firstShort}`];
  }
  const secondShort = formatMoneyShort(numbers[1]!);
  return [
    `${firstShort} a ${secondShort}`,
    `de ${firstShort} a ${secondShort}`,
    `${prefix} de ${firstShort} a ${secondShort}`,
  ];
}

function parseMoneyNumbers(value: string): number[] {
  const normalized = normalize(value).replace(/\+\s*1\b/g, ' ');
  return (normalized.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g) ?? [])
    .map((item) => Number(item.replace(/\./g, '').replace(',', '.')))
    .filter((item) => Number.isFinite(item));
}

function formatMoneyShort(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000} milhao`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000} mil`;
  return String(value);
}

function matchesIncomeConstraint(message: string, option: string): boolean | null {
  if (!/(renda|salario|ganha|classe economica|por mes|mensal)/.test(message)) return null;
  const optionRange = parseIncomeRange(option);
  if (!optionRange) return null;
  const constraint = parseIncomeConstraint(message);
  if (!constraint) return null;
  if (constraint.mode === 'lessThan') return optionRange.max <= constraint.value;
  if (constraint.mode === 'greaterThan') return optionRange.min > constraint.value;
  if (constraint.mode === 'between') {
    return optionRange.min >= constraint.min && optionRange.max <= constraint.max;
  }
  return optionRange.min <= constraint.value && optionRange.max >= constraint.value;
}

function parseIncomeRange(value: string): { min: number; max: number } | null {
  const numbers = parseNumbers(value);
  const normalized = normalize(value);
  if (numbers.length >= 2) return { min: numbers[0]!, max: numbers[1]! };
  if (numbers.length === 1 && /(acima|mais|\+)/.test(normalized)) {
    return { min: numbers[0]!, max: Number.POSITIVE_INFINITY };
  }
  if (numbers.length === 1 && /(ate|menos|abaixo)/.test(normalized)) {
    return { min: 0, max: numbers[0]! };
  }
  return null;
}

function parseIncomeConstraint(
  value: string,
):
  | { mode: 'lessThan' | 'greaterThan' | 'exact'; value: number }
  | { mode: 'between'; min: number; max: number }
  | null {
  const numbers = parseNumbers(value);
  const first = numbers[0];
  const second = numbers[1];
  if (first !== undefined && second !== undefined && /entre|de\s+\d+.*a|a\s+\d+/.test(value)) {
    return { mode: 'between', min: first, max: second };
  }
  if (first === undefined) return null;
  if (/(ate|no maximo|menor|abaixo)/.test(value)) return { mode: 'lessThan', value: first };
  if (/(acima|mais|superior)/.test(value)) return { mode: 'greaterThan', value: first };
  return { mode: 'exact', value: first };
}

function withCoreDemographicCatalog(
  catalog: AudienceCatalogOption[],
): AudienceCatalogOption[] {
  const hasFemale = catalog.some((option) => {
    const optionText = normalize(option.option);
    return (resolveAudienceField(option) ?? inferFieldFromOptionText(option.option)) === 'gender'
      && /femin|mulher|female|^f$/.test(optionText);
  });
  const hasMale = catalog.some((option) => {
    const optionText = normalize(option.option);
    return (resolveAudienceField(option) ?? inferFieldFromOptionText(option.option)) === 'gender'
      && /mascul|homem|male|^m$/.test(optionText);
  });
  const hasUsableAgeDimension = catalog.some(
    (option) =>
      (resolveAudienceField(option) ?? inferFieldFromOptionText(option.option)) === 'idadeFaixas' &&
      parseAgeRange(option.option) !== null,
  );
  const hasUsableOccupationDimension = catalog.some(
    (option) =>
      (resolveAudienceField(option) ?? inferFieldFromOptionText(option.option)) === 'ocupacao' &&
      Boolean(option.option.trim()),
  );

  return [
    ...catalog,
    ...CORE_GENDER_CATALOG.filter((option) =>
      option.option === 'Feminino' ? !hasFemale : !hasMale,
    ),
    // A dimensão pode ser reconhecida por engano ou conter opções como
    // "Não informado". Só dispensamos o fallback quando existe pelo menos
    // uma opção de idade que pode ser convertida em faixa.
    ...(hasUsableAgeDimension ? [] : CORE_AGE_CATALOG),
    ...(hasUsableOccupationDimension ? [] : CORE_OCCUPATION_CATALOG),
  ];
}

/**
 * Permite que o classificador continue usando opções reais mesmo quando o
 * Services publica uma pergunta sem `fieldKey` e com um título resumido. A
 * heurística só é aplicada a valores que são inequívocos; perguntas
 * verdadeiramente dinâmicas continuam no caminho genérico do catálogo/LLM.
 */
function inferFieldFromOptionText(value: string): AudienceField | null {
  const normalized = normalize(value);
  if (/femin|mulher|female|^f$/.test(normalized)) return 'gender';
  if (/mascul|homem|male|^m$/.test(normalized)) return 'gender';
  if (parseAgeRange(value) !== null) return 'idadeFaixas';
  if (/autonom|profissional liberal|empregador|setor privado|setor publico|aposentad|pensionista|estudante|trabalhador domestico|do lar/.test(normalized)) {
    return 'ocupacao';
  }
  return null;
}

function genericNaturalAliases(value: string): string[] {
  const normalized = normalize(value);
  if (/autonom|profissional liberal/.test(normalized)) {
    return [
      'autonomo',
      'autonoma',
      'autonomos',
      'autonomas',
      'profissional autonomo',
      'profissionais autonomos',
      'profissional liberal',
      'profissionais liberais',
      'por conta propria',
      'freelancer',
    ];
  }
  if (/femin|mulher|female|^f$/.test(normalized)) return ['mulher', 'mulheres'];
  if (/mascul|homem|male|^m$/.test(normalized)) return ['homem', 'homens'];
  return [];
}

/** Exportado para a validação do patch do LLM incluir os fallbacks nativos. */
export function getAudienceCatalogWithCoreDemographics(
  catalog: AudienceCatalogOption[],
): AudienceCatalogOption[] {
  return withCoreDemographicCatalog(catalog);
}

function resolveAudienceField(
  filter: Pick<AudienceFilterSelection, 'question' | 'questionOriginal' | 'fieldKey'> & {
    option?: string;
  },
): AudienceField | null {
  const metadataField = normalizeFieldKey(filter.fieldKey);
  if (metadataField) return metadataField;
  const searchable = normalize(`${filter.question} ${filter.questionOriginal ?? ''}`);
  const compactSearchable = searchable.replace(/[^a-z0-9]+/g, '');

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
  if (/tipo.*imovel|imovel.*tipo|tipo[ ]+de[ ]+imovel/.test(searchable)) {
    return 'tipoImovel';
  }
  if (/valor.*imovel|imovel.*valor|desembolsar.*imovel/.test(searchable)) {
    return 'valorImovel';
  }
  if (/tipo.*automovel|automovel.*tipo|automovel.*sera|carro.*novo|carro.*usado/.test(searchable)) {
    return 'tipoAutomovel';
  }
  if (/categoria.*automovel|considera.*compra|compra[ ]+de.*(moto|veiculo)/.test(searchable)) {
    return 'categoriaAutomovel';
  }
  if (/valor.*automovel|automovel.*valor|desembolsar.*automovel/.test(searchable)) {
    return 'valorAutomovel';
  }
  if (/modalidade.*agro|agro.*modalidade/.test(searchable)) {
    return 'modalidadeAgro';
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
  if (/animal|pet|estimacao/.test(searchable) || /animal|pet/.test(compactSearchable)) {
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
  if (/sexo|genero|gender/.test(searchable) || /sexo|genero|gender/.test(compactSearchable)) {
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
  if (
    /idade|faixa etaria|\banos\b|\bage\b/.test(searchable) ||
    /idade|faixaetaria/.test(compactSearchable)
  ) {
    return 'idadeFaixas';
  }
  if (/consum.*midia|onde.*(ouve|assiste)|meio.*comunic|canal.*comunic/.test(searchable)) {
    return 'consumoMidia';
  }
  if (/conteudo|interess|programa|assunto/.test(searchable)) {
    return 'preferenciaConteudo';
  }
  // Algumas instalações antigas do Services publicam a pergunta com um
  // título genérico (por exemplo, "Público-alvo"), mas as opções continuam
  // sendo inequívocas. Usar o valor apenas para estas dimensões estáveis
  // permite materializar sexo, idade e ocupação sem adivinhar filtros
  // dinâmicos nem depender de IDs.
  return inferFieldFromOptionText(filter.option ?? '');
}

function normalizeFieldKey(value: string | undefined): AudienceField | null {
  if (!value?.trim()) return null;
  return FIELD_KEY_ALIASES[compactAudienceValue(value)] ?? null;
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

  const compactNormalized = compactAudienceValue(normalized);
  const compactExact = canonicalValues.find(
    (candidate) => compactAudienceValue(candidate) === compactNormalized,
  );
  if (compactExact) return compactExact;

  const partial = canonicalValues.find((candidate) => {
    const candidateNormalized = normalize(candidate);
    if (
      candidateNormalized.includes(normalized) ||
      normalized.includes(candidateNormalized)
    ) {
      return true;
    }
    const candidateTokens = meaningfulTokens(candidateNormalized);
    const valueTokens = meaningfulTokens(normalized);
    return candidateTokens.length >= 2 && candidateTokens.every((token) =>
      valueTokens.some((valueToken) =>
        valueToken === token ||
        (token.length >= 5 && valueToken.startsWith(token.slice(0, -1))),
      ),
    );
  });
  if (partial) return partial;

  // Mantém o valor validado do catálogo quando a administração cadastrou uma
  // variante nova; a seleção original ainda permite o cálculo remoto.
  return value;
}

function compactAudienceValue(value: string): string {
  return normalize(value).replace(/[^a-z0-9]/g, '');
}

function meaningfulTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !NATURAL_STOP_WORDS.has(token));
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
): AgeConstraint | null {
  const numericValue = normalizeNumberWords(value);
  const between = numericValue.match(
    /(?:entre|de)\s*(\d{1,3})\s*(?:e|a|ate|[-–])\s*(\d{1,3})/,
  ) ?? numericValue.match(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/);
  if (between?.[1] && between[2]) {
    return {
      mode: 'between',
      value: Number(between[1]),
      upperValue: Number(between[2]),
    };
  }

  const lessThan = numericValue.match(
    /(?:menos|abaixo|inferior|menor)\s*(?:de|do|da|dos|das|que)?\s*(\d{1,3})/,
  );
  if (lessThan?.[1]) {
    return { mode: 'lessThan', value: Number(lessThan[1]) };
  }
  const atMost = numericValue.match(
    /(?:ate|no maximo|maximo de)\s*(?:os|as|de)?\s*(\d{1,3})/,
  );
  if (atMost?.[1]) {
    return { mode: 'lessThan', value: Number(atMost[1]) + 1 };
  }
  const atLeast = numericValue.match(
    /(?:a partir|desde)\s*(?:de|do|da|dos|das|os|as)?\s*(\d{1,3})/,
  );
  if (atLeast?.[1]) {
    return { mode: 'atLeast', value: Number(atLeast[1]) };
  }
  const greaterThan = numericValue.match(
    /(?:mais|acima|superior|maior)\s*(?:de|que|do|da|dos|das)?\s*(\d{1,3})/,
  );
  if (greaterThan?.[1]) {
    return { mode: 'greaterThan', value: Number(greaterThan[1]) };
  }
  const suffix = numericValue.match(
    /\b(\d{1,3})\s*(?:anos?\s*)?(?:ou mais|pra cima|\+)/,
  );
  if (suffix?.[1]) {
    return { mode: 'atLeast', value: Number(suffix[1]) };
  }
  const exact = numericValue.match(/\b(\d{1,3})\s+anos?\b/);
  if (exact?.[1]) {
    return { mode: 'exact', value: Number(exact[1]) };
  }
  return null;
}

function parseAgeRange(value: string): { min: number; max: number } | null {
  const normalized = normalizeNumberWords(value);
  const numbers = parseNumbers(normalized);
  if (/menor\s+de\s+18/.test(normalized)) return { min: 0, max: 17 };
  if (numbers.length >= 2) {
    return { min: numbers[0]!, max: numbers[1]! };
  }
  if (numbers.length === 1 && /(?:ate|menor|abaixo)/.test(normalized)) {
    return { min: 0, max: numbers[0]! };
  }
  if (numbers.length === 1 && /(?:mais|acima|superior|maior)/.test(normalized)) {
    return { min: numbers[0]! + 1, max: 99 };
  }
  if (numbers.length === 1 && /\+|ou mais/.test(normalized)) {
    return { min: numbers[0]!, max: 99 };
  }
  if (numbers.length === 1) return { min: numbers[0]!, max: numbers[0]! };
  return null;
}

const PORTUGUESE_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
};

function normalizeNumberWords(value: string): string {
  let normalized = normalize(value);
  const tens = Object.entries(PORTUGUESE_NUMBER_WORDS).filter(([, number]) => number >= 20 && number < 100);
  const units = Object.entries(PORTUGUESE_NUMBER_WORDS).filter(([, number]) => number >= 1 && number < 10);

  for (const [tensWord, tensValue] of tens) {
    for (const [unitWord, unitValue] of units) {
      normalized = normalized.replace(
        new RegExp(`\\b${escapeRegExp(tensWord)}\\s+e\\s+${escapeRegExp(unitWord)}\\b`, 'g'),
        String(tensValue + unitValue),
      );
    }
  }
  for (const [word, number] of Object.entries(PORTUGUESE_NUMBER_WORDS)) {
    normalized = normalized.replace(
      new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'),
      String(number),
    );
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
