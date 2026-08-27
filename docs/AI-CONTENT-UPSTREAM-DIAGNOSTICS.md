# Diagnóstico da integração de conteúdo de campanha

Data: 26/08/2026  
Escopo: `ai-api` e correlação com o `services`

## O que foi alterado

Foi adicionada observabilidade segura para investigar respostas `502` no endpoint
`GET /api/campaigns/:campaignId/ai-content`.

Os dois pontos de integração agora registram a causa resumida da falha:

1. autenticação do usuário em `GET /users/me`;
2. contexto da campanha em
   `GET /integrations/campaigns/:campaignId/ai-content/context`.

O registro utiliza a marca `[campaign-content-diagnostic]` e informa apenas:

- operação (`current_user` ou `campaign_context`);
- host do backend consultado;
- status HTTP retornado, quando existir;
- classificação da falha;
- tempo da chamada;
- identificador da requisição enviada ao `services`;
- identificador, código e mensagem pública sanitizada retornados pelo `services`,
  quando a versão publicada fornecer esses campos;
- identificador da campanha somente quando ele é um UUID válido;
- quantidade de problemas, quando o contrato JSON não for compatível.

Tokens, cabeçalhos de autenticação, corpo bruto da resposta upstream, stack traces
e dados pessoais não são registrados. A mensagem só é registrada quando vem junto
do contrato seguro de erro com identificador/código.

## Arquivos alterados neste diagnóstico

- `src/modules/campaign-content/ummix/upstream-diagnostics.ts` — classificação e
  registro sanitizado das falhas.
- `src/modules/campaign-content/ummix/context-client.ts` — instrumentação da
  consulta do contexto, envio do `X-Request-Id`, leitura dos campos seguros de erro
  e validação do `campaignId` retornado.
- `src/modules/campaign-content/routes/campaign-content-routes.ts` — instrumentação
  da autenticação upstream usada pelo módulo de conteúdo.
- `src/modules/campaign-content/module.ts` — conexão do logger do Fastify ao cliente
  de contexto.
- `src/modules/campaign-content/ummix/context-client.test.ts` — testes de status
  upstream, timeout, correlação de erro, contrato inválido e contexto de outra
  campanha.
- `src/modules/campaign-content/routes/campaign-content-routes.test.ts` — teste da
  falha de autenticação upstream sem exposição do Bearer token.

## Como usar na homologação

1. Fazer commit e push somente do repositório `ai-api`.
2. Aguardar o deploy do serviço `ummix-ai-api-homol` no Render.
3. Repetir o acesso ao conteúdo da campanha.
4. Consultar os logs do Render e localizar `[campaign-content-diagnostic]`.
5. Enviar para análise somente os campos `operation`, `upstreamStatus`,
   `failureKind`, `contractFailure`, `issueCount`, `elapsedMs`, `requestId`,
   `upstreamRequestId`, `upstreamErrorCode` e `upstreamMessage`. Nunca enviar
   valores de variáveis de ambiente ou tokens.

Não é necessário publicar novamente o `ai-web` para essa instrumentação.
Também não há alteração em `services`, `web` ou no banco principal da Workingtech.

## Interpretação

| `failureKind` | Interpretação inicial | Próxima verificação |
|---|---|---|
| `unauthorized` / `forbidden` | credencial ou escopo recusado | conferir configuração do token no Render, sem expô-lo |
| `not_found` | URL ou rota não encontrada | conferir `UMMIX_API_URL` e a versão publicada do backend |
| `validation` | campanha rejeitada pelo backend principal | conferir os dados da campanha e o log do backend |
| `server_error` | erro interno no backend ou banco principal | consultar o log da Workingtech |
| `contract_invalid` | resposta incompatível com o contrato esperado | comparar o contrato e a versão publicada |
| `timeout` / `network` | falha de comunicação | verificar disponibilidade e conectividade do endpoint |

O log passa a permitir a correlação com o `services` e pode revelar uma mensagem
pública de erro. Ele não substitui o stack trace interno do backend principal
quando a falha estiver nos dados ou no banco da campanha.

## Diagnóstico confirmado em 27/08/2026

O `502` da campanha de homologação foi reproduzido como um `500` originado no
`services`. A causa encontrada no código foi o tratamento das colunas PostgreSQL
`date`: o driver entrega `start_date` e `end_date` como texto `YYYY-MM-DD`, mas o
endpoint chamava `toISOString()` como se fossem objetos `Date`.

Depois da correção no `ummix-back-develop`, os códigos abaixo podem ser
correlacionados diretamente no log do Render:

| Código | Etapa que falhou |
|---|---|
| `AI_CONTENT_CAMPAIGN_LOOKUP_FAILED` | consulta da campanha no banco principal |
| `AI_CONTENT_PAYMENT_LOOKUP_FAILED` | consulta do pagamento no banco principal |

O código não inclui SQL, stack trace, credenciais ou dados da campanha. O detalhe
técnico permanece somente no log interno do backend principal.
