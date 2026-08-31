import { describe, expect, it } from 'vitest';
import {
  inferNaturalAudienceFilters,
  mapAudienceFiltersToTargetAudience,
} from './audience-filter-mapper.js';

describe('audience filter mapper', () => {
  it('maps catalog answers to the canonical Perfil & Hábitos fields', () => {
    const result = mapAudienceFiltersToTargetAudience([
      {
        questionId: 'age-question',
        question: 'Faixa etária',
        questionOriginal: 'P3. Qual sua idade?',
        optionId: 'age-option',
        option: '30 a 34 anos',
      },
      {
        questionId: 'income-question',
        question: 'Renda familiar',
        questionOriginal: 'P4. Renda familiar mensal',
        optionId: 'income-option',
        option: 'R$ 2.001 a R$ 5.000',
      },
      {
        questionId: 'children-question',
        question: 'Possui filhos?',
        questionOriginal: 'P5. Possui filhos?',
        optionId: 'children-option',
        option: 'Sim',
      },
      {
        questionId: 'occupation-question',
        question: 'Ocupação',
        optionId: 'occupation-option',
        option: 'Estudante',
      },
    ]);

    expect(result).toMatchObject({
      idadeFaixas: ['30-34'],
      renda: ['R$ 2.001 - R$ 5.000'],
      filhos: 'sim',
      ocupacao: ['Estudante'],
    });
    expect(result.selections).toEqual([
      {
        question: 'Faixa etária',
        questionOriginal: 'P3. Qual sua idade?',
        answers: ['30 a 34 anos'],
      },
      {
        question: 'Renda familiar',
        questionOriginal: 'P4. Renda familiar mensal',
        answers: ['R$ 2.001 a R$ 5.000'],
      },
      {
        question: 'Possui filhos?',
        questionOriginal: 'P5. Possui filhos?',
        answers: ['Sim'],
      },
      {
        question: 'Ocupação',
        answers: ['Estudante'],
      },
    ]);
  });

  it('emits both gender aliases required by the campaign boundary', () => {
    expect(mapAudienceFiltersToTargetAudience([
      {
        questionId: 'gender-question',
        question: 'Sexo',
        optionId: 'female-option',
        option: 'Feminino',
      },
    ])).toMatchObject({
      gender: ['Feminino'],
      sexo: ['Feminino'],
    });
  });

  it('infers gender and all catalog age ranges below a natural-language limit', () => {
    const result = inferNaturalAudienceFilters('Mulheres com menos de 40 anos', [
      {
        questionId: 'gender-question',
        question: 'Gênero',
        category: 'perfil_habitos',
        optionId: 'female-option',
        option: 'Feminino',
      },
      ...['15-20', '21-24', '25-29', '30-34', '35-39', '40-44'].map((option) => ({
        questionId: 'age-question',
        question: 'Faixa etária',
        category: 'perfil_habitos',
        optionId: `age-${option}`,
        option,
      })),
    ]);

    expect(result.map((filter) => filter.option)).toEqual([
      'Feminino',
      '15-20',
      '21-24',
      '25-29',
      '30-34',
      '35-39',
    ]);
  });

  it.each([
    ['Mulheres', 'Feminino'],
    ['mulheres com mais de 30 anos', 'Feminino'],
    ['homens', 'Masculino'],
  ])('infere %s usando o valor de gênero do catálogo', (message, expectedGender) => {
    const result = inferNaturalAudienceFilters(message, [
      {
        questionId: 'gender-question',
        question: 'Sexo',
        category: 'perfil',
        optionId: 'female-option',
        option: 'Feminino',
      },
      {
        questionId: 'gender-question',
        question: 'Sexo',
        category: 'perfil',
        optionId: 'male-option',
        option: 'Masculino',
      },
    ]);

    expect(result.filter((filter) => filter.questionId === 'gender-question').map((filter) => filter.option))
      .toEqual([expectedGender]);
  });

  it.each([
    ['Mulheres', 'Feminino'],
    ['homens', 'Masculino'],
  ])('keeps the core %s demographic available when the remote catalog is empty', (message, option) => {
    expect(inferNaturalAudienceFilters(message, [])).toEqual([
      expect.objectContaining({
        question: 'Sexo',
        option,
      }),
    ]);
  });

  it('keeps canonical age ranges available when the remote catalog is empty', () => {
    expect(
      inferNaturalAudienceFilters('Pessoas com mais de 30 anos', [])
        .map((filter) => filter.option),
    ).toEqual(['35-44', '45-54', '55+']);
  });

  it('infere somente as faixas inteiramente acima do limite informado', () => {
    const result = inferNaturalAudienceFilters('Mulheres com mais de 30 anos', [
      {
        questionId: 'gender-question',
        question: 'Sexo',
        category: 'perfil',
        optionId: 'female-option',
        option: 'Feminino',
      },
      ...['30-34', '35-39', '40-44'].map((option) => ({
        questionId: 'age-question',
        question: 'Faixa Etária',
        category: 'perfil',
        optionId: `age-${option}`,
        option,
      })),
    ]);

    expect(result.map((filter) => filter.option)).toEqual(['Feminino', '35-39', '40-44']);
  });

  it('reconhece idade em rótulos publicados pelo catálogo real', () => {
    const result = inferNaturalAudienceFilters('mulheres com mais de 20 anos', [
      {
        questionId: 'age-question',
        question: 'Idade',
        category: 'perfil_habitos',
        optionId: 'age-15-20',
        option: '15 a 20 anos',
      },
      {
        questionId: 'age-question',
        question: 'Idade',
        category: 'perfil_habitos',
        optionId: 'age-21-24',
        option: '21 a 24 anos',
      },
      {
        questionId: 'age-question',
        question: 'Idade',
        category: 'perfil_habitos',
        optionId: 'age-25-34',
        option: '25 a 34 anos',
      },
      {
        questionId: 'age-question',
        question: 'Idade',
        category: 'perfil_habitos',
        optionId: 'age-60-plus',
        option: 'Acima de 60 anos',
      },
    ]);

    expect(result.map((filter) => filter.option)).toEqual([
      '21 a 24 anos',
      '25 a 34 anos',
      'Acima de 60 anos',
      'Feminino',
    ]);
  });

  it('reconhece palavras-chave para dimensões allowlistadas além de gênero e idade', () => {
    const result = inferNaturalAudienceFilters(
      'mães, profissionais liberais que gostam de futebol e ouvem rádio',
      [
        {
          questionId: 'children-question',
          question: 'Possui filhos?',
          category: 'perfil_habitos',
          optionId: 'children-yes',
          option: 'Sim',
        },
        {
          questionId: 'occupation-question',
          question: 'Ocupação',
          category: 'perfil_habitos',
          optionId: 'occupation-self-employed',
          option: 'Autônomo ou Profissional Liberal',
        },
        {
          questionId: 'content-question',
          question: 'Preferência de conteúdo',
          category: 'perfil_habitos',
          optionId: 'content-sport',
          option: 'Esporte',
        },
        {
          questionId: 'media-question',
          question: 'Consumo de mídia',
          category: 'perfil_habitos',
          optionId: 'media-radio',
          option: 'Rádio AM/FM',
        },
      ],
    );

    expect(result.map((filter) => filter.option)).toEqual([
      'Sim',
      'Autônomo ou Profissional Liberal',
      'Esporte',
      'Rádio AM/FM',
    ]);
  });

  it('reconhece filtros condicionais de imóvel, automóvel e agronegócio', () => {
    const result = inferNaturalAudienceFilters(
      'pessoas que querem comprar uma casa de até 250 mil e trabalham no agro',
      [
        {
          questionId: 'buy-home-question',
          question: 'Você pretende comprar um imóvel?',
          category: 'perfil_habitos',
          optionId: 'buy-home-yes',
          option: 'Sim',
        },
        {
          questionId: 'home-type-question',
          question: 'Tipo de imóvel',
          category: 'perfil_habitos',
          optionId: 'home-type-house',
          option: 'Casa',
        },
        {
          questionId: 'home-value-question',
          question: 'Valor do imóvel',
          category: 'perfil_habitos',
          optionId: 'home-value-low',
          option: 'até R$ 250.000,00',
        },
        {
          questionId: 'agro-question',
          question: 'Você trabalha ou tem relação com o agronegócio?',
          category: 'perfil_habitos',
          optionId: 'agro-yes',
          option: 'Sim',
        },
      ],
    );

    expect(result.map((filter) => filter.option)).toEqual([
      'Sim',
      'Casa',
      'até R$ 250.000,00',
      'Sim',
    ]);
  });

  it('não confunde uma afirmação negada com a opção positiva', () => {
    const result = inferNaturalAudienceFilters('mulheres sem filhos', [
      {
        questionId: 'children-question',
        question: 'Possui filhos?',
        category: 'perfil_habitos',
        optionId: 'children-yes',
        option: 'Sim',
      },
      {
        questionId: 'children-question',
        question: 'Possui filhos?',
        category: 'perfil_habitos',
        optionId: 'children-no',
        option: 'Não',
      },
    ]);

    expect(result.map((filter) => filter.option)).toEqual(['Não', 'Feminino']);
  });

  it('usa as faixas amplas atuais do Services sem aplicar uma faixa parcialmente', () => {
    const result = inferNaturalAudienceFilters('Mulheres com mais de 30 anos', [
      {
        questionId: 'gender-question',
        question: 'Sexo',
        category: 'perfil',
        optionId: 'female-option',
        option: 'Feminino',
      },
      ...['25-34', '35-44', '45-54', '55+'].map((option) => ({
        questionId: 'age-question',
        question: 'Faixa etária',
        category: 'perfil',
        optionId: `age-${option}`,
        option,
      })),
    ]);

    expect(result.map((filter) => filter.option)).toEqual([
      'Feminino',
      '35-44',
      '45-54',
      '55+',
    ]);
  });

  it('preserva as faixas etárias publicadas pelo catálogo', () => {
    const result = mapAudienceFiltersToTargetAudience([
      {
        questionId: 'age-question',
        question: 'Faixa Etária',
        optionId: 'under-18',
        option: 'Menor de 18',
      },
      {
        questionId: 'age-question',
        question: 'Faixa Etária',
        optionId: 'age-25-34',
        option: '25-34',
      },
      {
        questionId: 'age-question',
        question: 'Faixa Etária',
        optionId: 'age-55-plus',
        option: '55+',
      },
    ]);

    expect(result.idadeFaixas).toEqual(['Menor de 18', '25-34', '55+']);
  });

  it('mapeia dimensões demográficas estruturais além de gênero e idade', () => {
    const result = mapAudienceFiltersToTargetAudience([
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
    ]);

    expect(result).toMatchObject({
      regiao: ['Norte'],
      religiao: ['Católica'],
      corRaca: ['Branca'],
      trabalhaEstudaFora: 'sim',
    });
  });

  it('does not invent dynamic age ranges when the remote age dimension exists', () => {
    expect(
      inferNaturalAudienceFilters('Mulheres com menos de 40 anos', [
        {
          questionId: 'age-question',
          question: 'Faixa etária',
          category: 'perfil_habitos',
          optionId: 'age-40',
          option: '40-44',
        },
      ]).map((filter) => filter.option),
    ).toEqual(['Feminino']);
  });

  it('keeps a catalog option in selections even when no UI field mapping exists', () => {
    const result = mapAudienceFiltersToTargetAudience([
      {
        questionId: 'unknown-question',
        question: 'Qual marca de celular você utiliza?',
        questionOriginal: 'P99. Marca de celular',
        optionId: 'unknown-option',
        option: 'Outra',
      },
    ]);

    expect(result).toEqual({
      selections: [
        {
          question: 'Qual marca de celular você utiliza?',
          questionOriginal: 'P99. Marca de celular',
          answers: ['Outra'],
        },
      ],
    });
  });
});
