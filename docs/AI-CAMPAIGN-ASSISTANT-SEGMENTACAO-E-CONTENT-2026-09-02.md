# AI Campaign Assistant — segmentação, alcance e nome fantasia — 2026-09-02

## Escopo desta entrega

Esta entrega altera somente o repositório independente `ai-api`.
Não foram alterados `ai-web`, `services`, `web` ou `admin` nesta etapa.

O escopo é:

1. manter o catálogo de novos filtros de segmentação orientado pelos dados publicados pelo Services;
2. preservar a seleção correta para o cálculo remoto, mesmo quando o filtro ainda não possui um campo canônico local;
3. coletar evidência segura para explicar diferenças entre o cálculo do assistente e o wizard manual;
4. perguntar o nome fantasia antes das demais perguntas do gerador de conteúdo e usá-lo como nome público do texto.

## Mapeamento dos filtros de segmentação

O `ai-api` não deve copiar uma lista fixa de perguntas do banco. A cada sessão ele consulta `GET /questions/user/active`, mantém somente perguntas de audiência e preserva:

- `questionId` e `optionId` originais;
- texto visível da pergunta e da opção;
- `config.originalExcelColumn`, usado pelo cálculo de respostas do Services;
- `fieldKey` quando o catálogo o informar diretamente ou dentro de `config` (`fieldKey`, `field`, `key`, `slug` ou `code`).

Os campos estáveis conhecidos continuam sendo convertidos para o shape canônico usado pelo wizard. O restante não é descartado: fica em `selections` e é enviado como `respostas` genéricas, sempre usando pergunta e opções provenientes do catálogo remoto. Assim, um novo filtro pode ser usado sem migration nem alteração do frontend, desde que o endpoint publique suas opções ativas e a pergunta original compatível com o Services.

O `fieldKey` só é convertido para um campo estruturado quando pertence à allowlist do mapper. Chaves desconhecidas continuam genéricas para evitar que uma alteração administrativa passe a gravar dados em um campo errado. A classificação natural continua sendo feita pelo LLM com o catálogo completo; o fallback determinístico cobre texto explicitamente compatível com opções do catálogo.

## Divergência entre assistente e campanha manual

A revisão do código mostrou que os cálculos não são equivalentes ainda. A diferença não deve ser corrigida por um percentual fixo.

### Diferenças confirmadas

- O wizard manual calcula `numFilters` contando grupos como cidades, estados, regiões e filtros de perfil.
- O assistente, nesta versão, envia `numFilters` como a quantidade de perguntas distintas presentes em `audienceFilters`; localização não entra nessa contagem.
- O Services aplica uma sobretaxa de CPM por `numFilters`. Portanto, entradas diferentes produzem CPM, impressões e alcance diferentes mesmo com o mesmo orçamento.
- O wizard manual envia condições EAV com `operador: AND`; o assistente agrupa opções da mesma pergunta com `operador: OR` para permitir alternativas dentro da mesma dimensão.
- O manual envia estado e, quando selecionada, a região por cidade. O assistente envia as cidades resolvidas e os filtros catalogados, mas não reproduz a seleção manual de região por cidade.
- O endpoint de impactos retorna `totalImpactos` como soma ponderada de `sample_weight` e `totalRespondentes` como contagem de linhas de resposta. O segundo não foi confirmado como usuário único, pois o código do Services não usa `COUNT(DISTINCT ...)`.
- O assistente transforma o plano em alcance contratado pelo orçamento, frequência e audiência disponível. O manual aplica o percentual do slider sobre o ICP calculado. São regras diferentes de apresentação/contratação.

### Diagnóstico adicionado

O `ai-api` agora registra, sem texto do cliente, token ou opções sensíveis:

- entrada do plano por canal: `numFilters`, quantidade de filtros e quantidade de localidades;
- resultado do impacto por canal: `totalImpacts`, `upstreamRespondents` e quantidade de filtros reconhecidos pelo upstream;
- chaves estáveis e categorias presentes no catálogo de filtros.

Os logs permitem comparar uma execução do assistente com a execução manual usando os mesmos parâmetros. A definição de “Usuários Únicos Segmentados” ainda precisa ser alinhada com a equipe do Services antes de alterar a fórmula.

## Nome fantasia no gerador de conteúdo

A primeira pergunta da sessão passou a ser:

> Qual o nome Fantasia da empresa que devemos divulgar?

O valor informado em `brand_name` prevalece sobre `companyBrand`, `companyName` ou `campaignName` vindos do snapshot da campanha. O gerador recebe esse valor como `contentBrandName` e deve usá-lo como nome público da empresa no texto. Sessões já iniciadas não são reordenadas retroativamente; a regra vale para novas sessões ou para sessões que ainda estejam recalculando os campos ausentes.

Essa alteração usa o campo JSON de respostas já existente. Não exige alteração de schema, migration, `ai-web` ou repositórios de terceiros.

## Arquivos alterados nesta linha de trabalho

### Assistente de campanha

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\domain\types.ts`
  - adiciona metadata opcional `fieldKey` ao catálogo e às seleções.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\domain\audience-filter-mapper.ts`
  - usa `fieldKey` allowlistado para mapear novos filtros e preserva metadata nas seleções.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\domain\audience-filter-mapper.test.ts`
  - cobre mapeamento por `fieldKey` e classificação natural de dimensão nova.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\services\assistant-service.ts`
  - preserva `fieldKey` ao validar as escolhas retornadas pelo LLM.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.ts`
  - lê metadata do catálogo, registra os diagnósticos de cálculo e preserva contagens do upstream.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.test.ts`
  - cobre metadata de novos filtros e separação entre impactos ponderados e respondentes upstream.

### Gerador de conteúdo

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\domain\briefing.ts`
  - inclui `brand_name` como primeira informação necessária.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\domain\briefing.test.ts`
  - cobre a nova ordem da pergunta.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\openai\content-generator.ts`
  - usa a resposta do cliente como `contentBrandName` e atualiza a versão do prompt.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\openai\content-generator.test.ts`
  - verifica a precedência do nome fantasia no payload enviado ao modelo.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\services\campaign-content-service.ts`
  - reserva gerações com a versão atual do prompt.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\services\campaign-content-service.test.ts`
  - atualiza os mocks para a versão atual do prompt.

## Publicação

Nenhum commit ou push foi feito. Para esta entrega, somente o `ai-api` precisa de novo commit e redeploy no Render. Alterações anteriores pendentes do `ai-web` continuam dependendo do deploy do Vercel conforme o documento de correção anterior.

## Validação local

- Testes focados: 5 arquivos e 47 testes aprovados.
- Suíte completa do `ai-api`: 16 arquivos e 106 testes aprovados.
- `npm.cmd run build` no `ai-api`: aprovado.
- `git diff --check`: aprovado; apenas avisos de conversão LF/CRLF do Windows.
- `graphify update .`: não executado com sucesso neste ambiente por `uv trampoline failed to canonicalize script path`.

## Correção adicional — classificação de todos os filtros — 2026-09-10

### Problema reproduzido

As frases abaixo eram reconhecidas pelo matcher determinístico quando testadas
isoladamente, mas o fluxo da conversa podia chegar ao classificador sem o
catálogo completo depois que a pergunta de público já havia sido respondida:

- `profissionais autonomos` deve selecionar `Ocupação → Autônomo e Profissional Liberal`;
- `possuem filhos e animais de estimação` deve selecionar simultaneamente
  `Possui Filhos → Sim` e `Possui Animais de Estimação → Sim`.

Quando uma resposta posterior coincidia com a pergunta corrente de orçamento,
data ou canal, a heurística baseada em palavras podia considerar que não era
uma resposta de público e enviar um catálogo vazio ao LLM. Isso explicava a
perda de filtros em frases de refinamento.

### Comportamento corrigido

- Depois que `audienceDescription` existe, refinamentos continuam recebendo o
  catálogo completo de filtros ativos, mesmo que a máquina de estados já tenha
  avançado para outra pergunta.
- A classificação não depende mais de uma lista fixa para descobrir se um
  filtro novo existe. Uma opção dinâmica do catálogo pode ser reconhecida pelo
  texto da opção, pelo LLM ou por seus metadados; a seleção é sempre validada
  contra o par original `questionId`/`optionId`.
- Respostas claramente de orçamento ou data continuam protegidas para não
  substituir a descrição do público. A resposta de canal também não vira, por
  engano, filtro de consumo de mídia.
- A inferência determinística percorre todas as opções do catálogo e não para
  depois da primeira dimensão. Portanto, várias dimensões na mesma frase são
  acumuladas e deduplicadas.
- Filtros sem campo canônico conhecido continuam preservados como `respostas`
  genéricas para o Services, em vez de serem descartados. Os campos conhecidos
  continuam sendo enviados também no shape nativo esperado pelo wizard.
- Foram mantidos os aliases de ocupação para `autônomo`, `profissional liberal`,
  `por conta própria` e flexões no plural.

### Arquivos adicionais alterados nesta correção

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\services\assistant-service.ts`
  - usa correspondências do catálogo e o contexto do estado para manter o
    catálogo completo em refinamentos; adiciona as proteções para orçamento e
    data.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\services\assistant-service.test.ts`
  - cobre uma opção dinâmica sem palavra-chave fixa depois do avanço da
    conversa e confirma que o catálogo completo chega ao classificador.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.ts`
  - mantém perguntas de Perfil & Hábitos como “Estado civil” no catálogo,
    mesmo quando o título começa com “Informe”.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.test.ts`
  - cobre a distinção entre “estado civil” e o estado operacional da campanha.

Nenhum arquivo de `ai-web`, `web`, `services` ou `admin` foi alterado nesta
correção. Nenhum commit ou push foi feito.

### Validação atualizada

- Testes focados: 3 arquivos e 40 testes aprovados.
- Suíte completa do `ai-api`: 16 arquivos e 110 testes aprovados.
- `npm.cmd run build` no `ai-api`: aprovado.
- `git diff --check`: aprovado; os avisos restantes são apenas de conversão
  LF/CRLF do Windows.
- `graphify update .`: tentativa feita após a alteração; o ambiente continua
  falhando com `uv trampoline failed to canonicalize script path`.

## Correção financeira e diagnóstico rastreável — 2026-09-11

### Evidência que motivou a correção

O log do Render da versão anterior mostrou que o catálogo remoto tinha 296
opções, mas não publicava `fieldKey` para as dimensões principais. Também
mostrou `audienceFilterCount=12` sendo reduzido a `numFilters=3`, porque o
assistente contava perguntas distintas e não as dimensões usadas pelo wizard
manual (praça, estado e cada grupo de segmentação).

Isso podia produzir CPM diferente antes mesmo da contratação. Na finalização,
o erro financeiro era usar toda a audiência como alcance, calcular as
impressões pela frequência e depois limitar apenas o investimento exibido.
Para o caso CPM `31,50`, frequência `66`, audiência `2.775` e teto de
`R$ 5.000,00`, isso gerava `183.150` impressões com um custo real de
`R$ 5.769,23`.

### Comportamento implementado

- O LLM continua sendo usado, mas sua resposta é validada contra o catálogo
  completo, não somente contra a lista ranqueada enviada como contexto.
- A inferência determinística percorre todas as opções e acumula várias
  dimensões na mesma frase. Inclui aliases para ocupação, gênero, idade,
  filhos e animais de estimação; não depende de um único filtro por mensagem.
- IDs estáveis internos de sexo/idade são aceitos somente quando pertencem ao
  catálogo sintético controlado pelo próprio `ai-api`.
- A classificação registra, sem texto do cliente, token ou valor de opção,
  os pares selecionados, a origem (`llm`, `deterministic` ou ambos), os campos
  canônicos resolvidos e candidatos rejeitados.
- O payload de impactos registra as dimensões, campos nativos e quantidade de
  respostas genéricas enviadas ao Services. O retorno mantém separados
  `totalImpacts` (impacto ponderado) e `upstreamRespondents` (linhas retornadas
  pelo upstream).
- `numFilters` passa a contar dimensões de audiência, e não quantidade de
  opções nem apenas IDs de perguntas. O cálculo inclui cidade, estado,
  gênero, idade, campos canônicos e perguntas dinâmicas. Como o wizard atual
  também reconta `selections` na etapa de finalização, o predicado dessa
  contagem foi mantido compatível com o helper publicado no frontend de
  terceiros, inclusive suas exceções legadas; isso evita um segundo CPM para a
  mesma campanha enquanto esse helper não for alterado lá.
- Na contratação, o teto é aplicado antes do alcance: primeiro calcula-se o
  máximo de impressões pagáveis, depois o alcance inteiro compatível com a
  frequência e, por fim, o investimento arredondado em centavos. A identidade
  `impressões × CPM / 1.000 = investimento` é preservada e o investimento não
  pode ultrapassar o teto.

Para o exemplo acima, o resultado correto do assistente passa a ser:

```text
Usuários/alcance contratado: 2.405
Total de impressões: 158.730
Investimento: R$ 5.000,00
```

### Logs para validação após o próximo deploy

Filtrar os logs do Render por estes diagnósticos, na ordem:

1. `campaign-assistant-audience-classification`: verificar
   `selectedFilterKeys`, `filterResolution`, `recognizedFieldKeys` e se
   `rejectedLlmCandidateCount` não descarta filtros válidos.
2. `campaign-assistant-audience-impact-payload`: verificar
   `selectedFilterFieldKeys`, `filterDimensions`, `demographicKeys` e
   `genericResponseCount`.
3. `campaign-assistant-audience-impact-result`: comparar `totalImpacts`,
   `upstreamRespondents` e `appliedFilterCount` por canal.
4. `campaign-assistant-budget-contract`: confirmar que
   `budgetInvariant=true` e que `contractedCostFromImpressions` coincide com
   `contractedInvestment`.

Se o primeiro e o segundo log mostrarem todos os filtros, mas o impacto
retornado continuar diferente do wizard, a perda estará comprovadamente no
contrato ou no cálculo do Services. Esta entrega não altera o Services.

### Arquivos alterados nesta correção

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\domain\audience-filter-mapper.ts`
  - torna o mapeamento tolerante a metadados ausentes e classifica múltiplas
    dimensões por frase.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\domain\audience-filter-mapper.test.ts`
  - cobre ocupação, gênero, idade, filhos e animais em linguagem natural.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\openai\extractor.ts`
  - aceita IDs internos controlados e reforça no prompt a classificação de
    várias dimensões.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\services\assistant-service.ts`
  - valida contra o catálogo completo, registra a trilha de classificação e
    aplica o contrato financeiro com teto rígido.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\services\assistant-service.test.ts`
  - cobre a identidade financeira com CPM `31,50` e frequência `66`.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.ts`
  - lê variantes de metadata do catálogo, conta dimensões compatíveis com o
    wizard e adiciona diagnósticos do payload e da persistência.
- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-assistant\ummix\ummix-client.test.ts`
  - cobre contagem de dimensões, metadata e diagnósticos do impacto.

Não foram alterados `ai-web`, `web`, `services` ou `admin`. Nenhum commit ou
push foi feito.

### Validação desta correção

- Testes focados: 3 arquivos e 43 testes aprovados.
- Suíte completa do `ai-api`: 16 arquivos e 113 testes aprovados.
- `npm.cmd run build` no `ai-api`: aprovado.
- `git diff --check`: sem erros de whitespace; permanecem apenas avisos
  normais de conversão LF/CRLF do Windows.
