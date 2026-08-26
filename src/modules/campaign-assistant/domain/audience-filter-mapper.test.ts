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
        answers: ['30 a 34 anos'],
      },
      {
        question: 'Renda familiar',
        answers: ['R$ 2.001 a R$ 5.000'],
      },
      {
        question: 'Possui filhos?',
        answers: ['Sim'],
      },
      {
        question: 'Ocupação',
        answers: ['Estudante'],
      },
    ]);
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

  it('does not invent filters when the catalog has no matching options', () => {
    expect(
      inferNaturalAudienceFilters('Mulheres com menos de 40 anos', [
        {
          questionId: 'age-question',
          question: 'Faixa etária',
          category: 'perfil_habitos',
          optionId: 'age-40',
          option: '40-44',
        },
      ]),
    ).toEqual([]);
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
          answers: ['Outra'],
        },
      ],
    });
  });
});
