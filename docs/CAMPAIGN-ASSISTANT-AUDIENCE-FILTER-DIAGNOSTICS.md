# Diagnóstico e correção dos filtros de público do Campaign Assistant

Data: 31/08/2026  
Escopo: `ai-api`  
Repositório de deploy: `https://github.com/Arynelson/ummix-ai-api.git`

## Sintoma investigado

Para uma resposta como `mulheres com mais de 20 anos`, o chat reconhecia apenas
`Feminino`. O log do Render registrava `ageFilterCount: 0`. Na tela final da
campanha, em alguns casos, apareciam somente as cidades, embora o payload
preparado pela plataforma AI já contivesse `gender` e `sexo`.

O deploy analisado no Render foi o commit `5d38cfa` (`31_8`). O problema de
idade foi reproduzido localmente com um catálogo que continha uma dimensão de
idade inutilizável, como uma opção `Não informado` ou um título que era
classificado como idade por engano.

## Causa confirmada

O mapper considerava que a dimensão remota de idade estava disponível apenas
porque uma pergunta era classificada como idade. Quando as opções dessa
pergunta não podiam ser convertidas em uma faixa numérica, o fallback local era
suprimido. O resultado era o gênero sem nenhuma faixa etária.

Também havia uma detecção ampla de `anos`, capaz de classificar palavras que
apenas contêm essa sequência de letras como uma pergunta de idade.

## Alterações realizadas

- `src/modules/campaign-assistant/domain/audience-filter-mapper.ts`
  - considera a dimensão remota utilizável somente quando há uma opção de idade
    realmente convertível em faixa;
  - usa limite de palavra para reconhecer `anos`;
  - mantém o fallback quando o catálogo remoto está vazio, inconsistente ou
    malformado;
  - usa faixas finas do Services no fallback, incluindo `21-24`, para que
    `mais de 20 anos` não seja reduzido indevidamente a `25+`;
  - preserva `Menor de 18` para o caso infantil.

- `src/modules/campaign-assistant/domain/audience-filter-mapper.test.ts`
  - adiciona regressão para catálogo com dimensão de idade inutilizável;
  - atualiza a expectativa do fallback para as faixas finas.

- `src/modules/campaign-assistant/ummix/ummix-client.ts`
  - após o PATCH da campanha, registra a forma da resposta do Services;
  - registra presença de `gender`/`sexo`, quantidade de faixas etárias,
    quantidade de `audienceFilters` e `selections`, além dos nomes dos campos;
  - reconhece resposta direta ou envelopada em `campaign`/`data`.

- `src/modules/campaign-assistant/ummix/ummix-client.test.ts`
  - adiciona regressão para o diagnóstico pós-PATCH;
  - garante que valores de público não sejam escritos no log.

## Segurança do diagnóstico

Os novos registros não incluem token, texto original do cliente, valores de
filtros, corpo bruto do Services, stack trace ou dados pessoais. Eles registram
apenas o formato da resposta e contagens necessárias para localizar a perda do
filtro.

## Validação após o deploy

1. Fazer commit e push somente do repositório `ai-api`.
2. Aguardar o deploy do serviço `ummix-ai-api-homol` no Render.
3. Criar uma nova sessão do Campaign Assistant ou responder novamente a etapa
   de público. Uma sessão já finalizada sem idade não será corrigida
   retroativamente pelo novo código.
4. Usar uma resposta como `mulheres com mais de 20 anos`.
5. Procurar no Render:

   - `campaign-assistant-audience-classification`: deve indicar mais de um
     filtro e incluir as faixas etárias;
   - `campaign-assistant-finalization-payload`: deve indicar
     `ageFilterCount` maior que zero;
   - `campaign-assistant-finalization-upstream-response`: mostra se o Services
     devolveu os campos depois do PATCH.

## Como interpretar o novo log do PATCH

| Resultado | Interpretação |
|---|---|
| `persistedHasGender: true` e `persistedAgeFilterCount > 0` | O Services devolveu os filtros; se a tela não exibir, investigar GET/hidratação do frontend de terceiros. |
| `persistedHasGender: true` e `persistedAgeFilterCount: 0` | O payload chegou com gênero, mas o Services não devolveu idade; será necessário investigar a persistência/transformação no backend principal. |
| `responseTargetAudienceFound: false` | O PATCH não retornou o objeto da campanha; é necessário consultar o GET da campanha ou adicionar diagnóstico no Services. |

Não foi alterado `services`, `web`, `admin` ou `ummix-ai-platform`. O `ai-web`
também não precisa de novo deploy para esta correção do classificador e do
diagnóstico do backend AI.
