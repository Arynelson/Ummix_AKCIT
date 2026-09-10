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
