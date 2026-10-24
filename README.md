# Ummix AI API

API independente dos módulos `campaign-assistant` e `campaign-content` da Ummix.
Transforma uma conversa em um planejamento de campanha de Rádio/TV e produz
três alternativas de texto publicitário para uma campanha existente.

O protótipo usa um LLM, memória de sessão, consultas às APIs da plataforma e
aprovação humana. A orquestração das etapas e das ferramentas é feita pelo
código; o modelo interpreta o briefing e escreve os textos. Não há um
planejador autônomo que decide quais ferramentas executar.

O perfil de homologação preparado para o hackathon roda no **Portainer**, com
containers separados para `ai-api`, `ai-web` e um PostgreSQL próprio. O arquivo
`render.yaml` permanece disponível para o deploy anterior no Render. Nenhuma
das opções acessa diretamente o banco principal: a integração com o backend
Ummix (`services` / `ummix-back-develop`) ocorre por HTTP autenticado.

## Arquitetura e acesso

| Componente | Responsabilidade |
|---|---|
| Frontend principal (`ummix-front-develop`) | Login, botão de criação de campanha e acesso ao conteúdo de uma campanha |
| `ai-web` | Chat, comparação de canais, apresentação e edição dos textos |
| `ai-api` | Autorização, sessões, validação, chamadas ao modelo e integração com a Ummix |
| PostgreSQL da IA | Sessões, mensagens, handoffs temporários, textos e métricas |
| API principal da Ummix | Clientes, campanhas, catálogo de segmentação, inventário, preços e dimensionamento |
| Provedor LLM | Interpretação estruturada do briefing e geração de textos |

O usuário autenticado clica no botão de IA da plataforma. O frontend envia
seu Bearer JWT a `POST /api/auth/handoff`. A API valida a identidade e emite
um acesso temporário de uso único. O navegador abre o `ai-web` em
`/auth/handoff`, troca esse acesso em `POST /api/auth/handoff/exchange` e segue
para `/campaign-assistant` ou `/campaign-content?campaignId=...`.

O JWT original não é colocado na URL. O token temporário não substitui o login
e uma URL direta do chat, sem sessão válida, não libera a funcionalidade.
`UMMIX_SERVICE_TOKEN` fica somente no servidor e é enviado no header
`x-service-token` nas integrações que o utilizam. As chamadas também preservam
o contexto de autorização do usuário.

## Fluxo 1 — Criar campanha

### Inputs

- Identidade do usuário e cliente autorizado, incluindo ramo de atividade.
- Objetivo: fortalecer a marca, lançar um produto ou promover uma oferta.
- Estado e praças escolhidas a partir das opções disponíveis na API.
- Descrição do público em linguagem natural.
- Orçamento máximo em reais, data de início e canal confirmado pelo usuário.

### Lógica

1. Carrega o cadastro do cliente, o mínimo de investimento, as praças e o
   catálogo de público da plataforma.
2. Conduz a coleta em etapas: objetivo, praças, público, orçamento, início e
   escolha final entre Rádio e TV. Produto/serviço não é uma pergunta
   obrigatória neste fluxo.
3. O LLM interpreta as mensagens e devolve campos estruturados. O backend
   valida os candidatos contra o catálogo, aplica normalização e aliases e
   usa opções controladas de gênero, idade e ocupação quando essas dimensões
   não estão disponíveis no catálogo remoto. Ambiguidades podem exigir
   confirmação do usuário; não basta o modelo inventar o nome de um filtro.
4. O código trata números simples como reais na pergunta de orçamento e
   converte pedidos de início imediato para quatro dias úteis. Essa contagem
   considera fins de semana, sem calendário de feriados.
5. Consulta o backend principal para comparar preço, frequência, período,
   projeções e impactos de Rádio e TV. O modelo não inventa esses números.
   A recomendação de canal segue uma heurística fixa do backend da IA.
6. Após a escolha humana do canal, aplica o teto financeiro, ajustando
   impressões, alcance e investimento conforme CPM, frequência e audiência
   disponível. A identidade de custo é `impressões × CPM / 1000`, com
   arredondamento monetário e investimento menor ou igual ao teto.
7. Na ação **Finalizar campanha**, cria e atualiza um rascunho pela API Ummix e
   devolve o acesso à etapa 4 do wizard, para revisão.

### Outputs

- Proposta comparativa de Rádio/TV com métricas de mídia.
- Campanha em rascunho no sistema principal, com filtros, datas, canal e
  valores, além de `campaignId`, `wizardStep: 4` e `reviewUrl`.
- Sessão e métricas no banco da IA. Ao finalizar, o histórico e o estado da
  sessão do assistente são esvaziados, preservando o vínculo com a campanha.

A aprovação, o pagamento e a ativação continuam no fluxo normal da plataforma.
O assistente não compra mídia ou publica uma campanha por conta própria.

## Fluxo 2 — Criar conteúdo

### Inputs

- `campaignId` e identidade do usuário autorizado.
- Contexto da campanha: cliente, objetivo, canal, formato, duração, público,
  datas e elegibilidade fornecida pela API principal.
- Nome fantasia que deve aparecer no texto, informado pelo usuário.
- Respostas ao briefing: mensagem da marca ou produto/serviço, benefício,
  oferta/validade quando aplicável, chamada para ação, tom e restrições.

### Lógica

1. Consulta `GET /integrations/campaigns/:campaignId/ai-content/context` no
   backend principal e verifica proprietário e `canGenerate`.
2. Cria ou retoma uma sessão. A primeira pergunta pede o nome fantasia para
   evitar usar automaticamente razão social ou o nome genérico do cliente.
3. Coleta as respostas com perguntas definidas pelo objetivo. Essa coleta é
   guiada pelo código; o LLM entra na redação depois do briefing.
4. Calcula o tamanho permitido com base na duração. O padrão é de 2,2 a 2,6
   palavras por segundo: uma peça de 15 segundos permite de 33 a 39 palavras.
5. Envia contexto e briefing ao LLM, que deve retornar **três textos distintos**
   em uma estrutura validada. Se a resposta violar o formato ou o tamanho, há
   uma tentativa adicional de correção.
6. O usuário escolhe um texto, pode editá-lo e clica em **Salvar texto**. O
   backend verifica a versão da sessão, a opção selecionada e o limite de
   palavras do texto final.
7. Salva o conteúdo vinculado à campanha no PostgreSQL da IA. Se habilitado,
   solicita o envio administrativo por e-mail, com estado de entrega e retry.

### Outputs

- Três opções em texto, indicação de tamanho e opção escolhida pelo usuário.
- Texto original, texto final, edição, contagem de palavras e identificação de
  campanha/geração no banco próprio da IA. Um novo salvamento arquiva o
  conteúdo anteriormente salvo da mesma campanha.
- E-mail opcional para `falecoma@ummix.com.br` e `tecnologia@ummix.com.br`.

O texto é salvo **no banco da IA, relacionado por `campaignId`**. O fluxo atual
não faz um PATCH desse texto no cadastro principal do Services. Ele produz
roteiros escritos, sem gerar áudio ou vídeo. A duração é uma estimativa por
palavras e precisa de revisão antes da produção da peça.

Campanhas com pagamento pendente podem participar quando o contexto upstream
retornar `canGenerate: true`. Administradores e gestores podem consultar o
conteúdo, mas a escrita exige o proprietário autorizado.

## API utilizada pelos fluxos

Todos os endpoints de negócio exigem autorização; `/health` e `/ready` são
sondas operacionais públicas.

| Operação | Endpoint da `ai-api` |
|---|---|
| Criar/trocar acesso temporário | `POST /api/auth/handoff`, `POST /api/auth/handoff/exchange` |
| Iniciar e consultar planejamento | `POST /api/campaign-assistant/sessions`, `GET /api/campaign-assistant/sessions/:id` |
| Responder ao planejamento | `POST /api/campaign-assistant/sessions/:id/messages` |
| Finalizar para revisão | `POST /api/campaign-assistant/sessions/:id/finalize` |
| Consultar conteúdo/contexto | `GET /api/campaigns/:campaignId/ai-content` |
| Iniciar briefing de conteúdo | `POST /api/campaigns/:campaignId/ai-content/sessions` |
| Responder/gerar conteúdo | `POST /api/campaigns/:campaignId/ai-content/sessions/:sessionId/messages`, `POST .../generate` |
| Salvar seleção e edição | `PUT /api/campaigns/:campaignId/ai-content/sessions/:sessionId/selection` |

Para planejamento, a integração upstream utiliza `/users/me`, `/clients/*`,
`/campaigns/config`, `/cities`, `/states`, `/questions/user/active`,
`POST /campaigns/calculate`, `POST /survey/impacts/advanced`,
`POST /campaigns/draft` e `PATCH /campaigns/:id`.

## Desenvolvimento

Pré-requisitos: Node.js 22, npm e PostgreSQL 16.
Preencher as URLs, a conexão do banco e a chave de handoff no arquivo local
antes de executar as migrations; os placeholders do exemplo não são válidos.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run db:migrate
npm.cmd run dev
```

Verificação:

```powershell
npm.cmd test
npm.cmd run build
```

## Homologação no Portainer e gravação do protótipo

O guia [Reativação para o hackathon](docs/REACTIVACAO-HACKATHON-2026-10-24.md)
contém o diagnóstico, a lista de arquivos alterados, variáveis por aplicação,
instruções de imagens/stack e roteiro de validação e gravação.

Stack: [deploy/portainer/docker-compose.yml](deploy/portainer/docker-compose.yml).
Variáveis: [deploy/portainer/.env.example](deploy/portainer/.env.example).
As URLs e credenciais devem ser preenchidas no ambiente; os domínios dos
exemplos são sugestões que dependem da infraestrutura de homologação.

Os acessos no frontend principal dependem de
`NEXT_PUBLIC_CAMPAIGN_ASSISTANT_ENABLED=true` e
`NEXT_PUBLIC_CAMPAIGN_CONTENT_ENABLED=true`. No `ai-web`, são as flags
`VITE_CAMPAIGN_ASSISTANT_ENABLED` e `VITE_CAMPAIGN_CONTENT_ENABLED`. Essas
variáveis de frontend entram no **build** das imagens. Um restart da imagem
antiga não altera o JavaScript entregue ao navegador.

No servidor da IA, `CAMPAIGN_ASSISTANT_ENABLED=true` e
`CAMPAIGN_CONTENT_ENABLED=true` habilitam os módulos. O envio de e-mail possui
controle independente: pode permanecer `false` para a gravação, e nesse caso
não se deve apresentar e-mail enviado como resultado da demonstração.

### Saúde e limites da validação

- `GET /health`: identifica módulos e se as dependências estão configuradas.
- `GET /ready`: testa acesso ao PostgreSQL e presença das tabelas necessárias.
- O teste funcional exige login, chat, consulta real à API principal, geração
  pelo provedor, revisão e salvamento. As sondas não comprovam essas etapas.

Defaults operacionais: sessões do assistente expiram em 120 minutos e aceitam
20 mensagens a cada 10 minutos. Conteúdo permite até três reservas de geração
por sessão; tentativas que falham também consomem essa contagem.

## Deploy anterior no Render

O `render.yaml` cria a API e um PostgreSQL temporário privado para homologação.
Os secrets marcados com `sync: false` devem ser preenchidos no painel do Render.
O serviço executa as migrations antes de iniciar a API e escuta a porta `10000`,
que é a porta padrão dos web services do Render.

A API utiliza `UMMIX_API_URL=https://ummix.workingtech.com.br/api` e mantém o
`UMMIX_SERVICE_TOKEN` somente no ambiente do servidor. O frontend nunca recebe
esse token.

`OPENAI_MODEL` foi definido como `gpt-5.6-luna` por decisão do projeto. O identificador precisa estar habilitado no projeto da OpenAI utilizado; se a conta utilizar outro modelo, substitua esse valor nas variáveis do Render.

O exemplo genérico e o Blueprint mantêm `CAMPAIGN_CONTENT_ENABLED=false` e
envio de e-mail desligado por padrão. O perfil Portainer habilita os dois
módulos explicitamente. A integração de contexto precisa existir e estar
habilitada no backend principal para a geração de conteúdo funcionar.

Em produção, TLS no PostgreSQL continua habilitado por padrão. O perfil
Portainer usa `DATABASE_SSL_ENABLED=false` exclusivamente para seu banco em
uma rede Docker privada, sem publicar a porta 5432. Não aplique essa opção a
um banco remoto exposto na internet.

## Contratos

`contracts/` é uma cópia versionada dos contratos públicos compartilhados com o
`ai-web`. Versão atual: `0.1.0`. Qualquer alteração nesse diretório deve ser
replicada no repositório `ai-web` e registrada no manifesto central do workspace.
