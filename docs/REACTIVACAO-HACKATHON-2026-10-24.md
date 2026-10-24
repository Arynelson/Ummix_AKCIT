# Reativação da IA para o hackathon

Data do diagnóstico: 24/10/2026. Destino escolhido: Portainer de homologação,
com `ai-api`, `ai-web` e PostgreSQL separado do banco principal.

## O que foi confirmado

1. No `ummix-front-develop`, o commit `f1cd7d1` de 16/09/2026
   (`chore(ai): hide experimental assistant actions`) comentou os botões e
   removeu imports, estados e handlers de abertura. Apenas mudar variáveis
   não restaurava esses acessos. Eles foram restaurados, respeitando flags.
2. O perfil genérico da IA mantém conteúdo desligado por padrão. A habilitação
   precisa existir na API, no build do `ai-web` e no build do frontend principal.
3. O serviço anterior do Render não estava administrativamente suspenso e
   mostrava o deploy `b7dc352` como `live`, mas os logs de 23 e 24/10 continham
   `getaddrinfo ENOTFOUND dpg-da1j9301ne8s73ci8v40-a` durante a inicialização.
   A listagem do mesmo workspace retornou **nenhuma instância PostgreSQL**.
   Isso confirma a conexão antiga indisponível, sem comprovar por que o banco
   foi removido ou se há backup. Estado `live` do deploy não provou API saudável.
4. O usuário não dispõe do acesso atual ao Portainer. O estado e as variáveis
   desse servidor não foram inspecionados.

## Preparação no código

- Restauração dos acessos de campanha e conteúdo com autorização por handoff.
- Controle de todos os acessos de conteúdo pela mesma flag e pelos status de
  campanha suportados. Pagamento pendente continua elegível para tentativa;
  a autorização definitiva é dada pelo contexto do backend principal.
- Fechar o modal aberto pelo atalho de pagamento pendente retorna ao
  pagamento. A tela de sucesso fica reservada ao fluxo normal de conclusão.
- Stack própria de IA com PostgreSQL 16, volume persistente e sem porta de
  banco publicada no host.
- `DATABASE_SSL_ENABLED=false` para o PostgreSQL privado do Docker. A API
  anterior forçava TLS em todo ambiente de produção, o que não funciona com
  o PostgreSQL padrão dessa stack. O padrão para outros destinos continua TLS.
- Migration `004` para permitir a métrica `audience_clarification_confirmed`,
  que o código já gravava mas o CHECK do banco não aceitava. Um banco novo
  precisa dessa migration para não falhar ao confirmar uma alternativa de público.
- README com inputs, lógica e outputs dos dois fluxos, incluindo seus limites.

## 1. Validar as premissas com o responsável pelo Portainer

O arquivo [`../deploy/portainer/docker-compose.yml`](../deploy/portainer/docker-compose.yml)
é para **Docker Standalone / Compose**, com imagens previamente construídas.
Não é uma stack Swarm. Ele usa o mesmo padrão Traefik observado no compose
atual do frontend principal:

- Rede externa: `proxy_shared_01`.
- Entrypoint HTTPS: `websecure`.
- Resolvedor de certificado: `letsencrypt`.

Confirmar esses nomes no servidor. Rede e resolvedor podem ser substituídos
pelas variáveis do exemplo. Os hosts sugeridos são
`ai-api-homol.workingtech.com.br` e `ai-homol.workingtech.com.br`; precisam de
DNS apontado para o servidor e HTTPS funcionando. Esses domínios não foram
provisionados ou confirmados por esta preparação.

Se o ambiente for Swarm, o responsável deve adaptar redes, secrets, deploy e
ordem de inicialização antes de usar esse arquivo. Não assumir que um botão
de restart ou redeploy no Portainer compila o código novo.

## 2. Construir as imagens

Atualizar os dois repositórios independentes e construir **no Docker host do
Portainer**, ou publicar as imagens em um registry acessível a ele.
Os comandos abaixo só documentam o procedimento; não foram executados no servidor.

Na raiz do repositório `ai-api`:

```sh
docker build -t ummix-ai-api:hackathon-2026-10-24 .
```

Na raiz do repositório `ai-web`, substituindo os domínios pelos confirmados:

```sh
docker build --build-arg VITE_AI_API_URL=https://ai-api-homol.workingtech.com.br --build-arg VITE_UMMIX_WEB_URL=https://ummix.workingtech.com.br --build-arg VITE_CAMPAIGN_ASSISTANT_ENABLED=true --build-arg VITE_CAMPAIGN_CONTENT_ENABLED=true -t ummix-ai-web:hackathon-2026-10-24 .
```

O Dockerfile do `ai-web` gera o bundle Vite e usa Nginx com fallback SPA para
as rotas do chat. `VITE_*` é configuração de build: colocá-la apenas no
ambiente do container Nginx não muda a interface compilada.

Os nomes acima são tags locais. Se o build ocorrer em outro computador,
publicar no registry escolhido e preencher `AI_API_IMAGE` e `AI_WEB_IMAGE`
com esses endereços. Imagem local não aparece automaticamente no servidor.
Portainer com registry privado precisa de autenticação própria nesse registry.

## 3. Configurar e publicar a stack da IA

Lista completa por stack, com valores de build e credenciais a preencher:
[`PORTAINER-VARIAVEIS-HOMOLOGACAO.md`](PORTAINER-VARIAVEIS-HOMOLOGACAO.md).

Criar a stack `ummix-ai-homol` usando o compose e preencher as variáveis de
[`../deploy/portainer/.env.example`](../deploy/portainer/.env.example).
Os placeholders `SUBSTITUIR_...` não são credenciais utilizáveis.

| Variável | Valor / origem |
|---|---|
| `AI_API_IMAGE`, `AI_WEB_IMAGE` | Tags de imagens já disponíveis no host ou registry |
| `AI_API_HOST`, `AI_WEB_HOST` | Domínios sem `https://`, já provisionados |
| `UMMIX_API_URL` | `https://ummix.workingtech.com.br/api` |
| `UMMIX_WEB_URL` | `https://ummix.workingtech.com.br`, sem caminho |
| `AI_POSTGRES_PASSWORD` | Senha nova e aleatória, preferencialmente hexadecimal |
| `UMMIX_SERVICE_TOKEN` | Token de integração; somente o valor, sem o nome do header |
| `AI_HANDOFF_ENCRYPTION_KEY` | Chave Base64 de exatamente 32 bytes |
| `OPENAI_API_KEY` | Credencial existente, guardada somente no servidor |
| `OPENAI_MODEL` | Manter a configuração do projeto e confirmar que o identificador é aceito pelo provedor da conta |
| `CAMPAIGN_ASSISTANT_ENABLED` | `true` |
| `CAMPAIGN_CONTENT_ENABLED` | `true` |
| `CAMPAIGN_CONTENT_EMAIL_ENABLED` | `false` para demonstrar sem enviar e-mail real |

Para gerar chave/senha em PowerShell compatível com a versão clássica:

```powershell
$keyBytes = New-Object byte[] 32
$keyGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $keyGenerator.GetBytes($keyBytes) } finally { $keyGenerator.Dispose() }
# Usar a saída abaixo SOMENTE na configuração protegida da chave de handoff.
[Convert]::ToBase64String($keyBytes)

$passwordBytes = New-Object byte[] 32
$passwordGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $passwordGenerator.GetBytes($passwordBytes) } finally { $passwordGenerator.Dispose() }
# Hexadecimal evita caracteres reservados na DATABASE_URL montada pela stack.
[BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
```

Não enviar os valores para o Git ou para esta documentação. A stack monta
`DATABASE_URL` com o host interno `postgres`; não reutilizar o hostname antigo
do Render. Alterar senha no compose não troca automaticamente a senha de um
PostgreSQL que já foi inicializado no volume: preservar e gerenciar esse volume.

A imagem da API aplica as migrations `001`–`004` antes de iniciar. O volume
persiste entre redeploys; não usar remoção de volumes para solucionar falhas.
Um banco novo começa sem as sessões e textos antigos da IA. O banco de
clientes/campanhas da plataforma não é recriado nem modificado pela stack.

E-mail real é opcional: para demonstrá-lo, configurar remetente autorizado e
chave do provedor em `CAMPAIGN_CONTENT_EMAIL_FROM` e
`CAMPAIGN_CONTENT_EMAIL_API_KEY`, além de habilitar a flag de e-mail. Manter
os destinatários administrativos previstos ou usar destinatários de teste
explicitamente autorizados. Salvar texto sem e-mail não comprova envio.

## 4. Reconstruir o frontend principal

Repositório: `C:\Users\aryha\Documents\Ummix\plataforma\ummix-front-develop`.
Mesclar as variáveis públicas de `.env.ai-homolog.example` com a configuração
existente do frontend. Preservar as variáveis da API principal, pagamentos e
demais módulos. `Dockerfile` e `docker-compose.yml` já encaminham essas chaves:

```dotenv
NEXT_PUBLIC_AI_API_URL=https://ai-api-homol.workingtech.com.br
NEXT_PUBLIC_AI_WEB_URL=https://ai-homol.workingtech.com.br
NEXT_PUBLIC_CAMPAIGN_ASSISTANT_API_URL=https://ai-api-homol.workingtech.com.br/api/campaign-assistant
NEXT_PUBLIC_CAMPAIGN_ASSISTANT_ENABLED=true
NEXT_PUBLIC_CAMPAIGN_CONTENT_ENABLED=true
```

Reconstruir a imagem do frontend com os argumentos de build e publicar essa
imagem. Só reiniciar o container antigo não restaura botões nem troca URLs.
A configuração usa a URL da API de IA sem `/api` no final; o launcher
acrescenta `/api/auth/handoff`. A variável legada de acompanhamento do
assistente inclui `/api/campaign-assistant` e não é a porta principal de entrada.

Não foi necessário alterar o `ummix-back-develop`. Ele precisa estar servindo
o adapter existente `GET /api/integrations/campaigns/:id/ai-content/context`
com Bearer do usuário e `x-service-token` aceito. Um 404/500 nesse endpoint
depende da publicação/configuração principal, não de Nginx ou dos botões.

No código atual de `ummix-back-develop`, o módulo já está registrado em
`src/app.module.ts`. O guard compara o header com a variável **`SERVICE_TOKEN`**
do backend principal. Portanto, `UMMIX_SERVICE_TOKEN` na IA precisa receber o
mesmo valor válido de homologação. Não colocar o prefixo `x-service-token:`
no valor e não trocar o token principal sem avaliar as outras integrações.

## 5. Verificar antes de gravar

- [ ] DNS, certificado e os dois hosts de IA acessíveis por HTTPS.
- [ ] Containers PostgreSQL, API e web saudáveis no Portainer.
- [ ] `/health` retorna os dois módulos habilitados e LLM configurado.
- [ ] `/ready` responde HTTP 200, `status: ready`, `database: ready`.
- [ ] Login real no frontend principal de homologação com cliente regular.
- [ ] Dashboard mostra **Montar campanha com IA**; clicar abre o chat por handoff.
- [ ] Concluir briefing, conferir filtros/cálculos, escolher canal e finalizar.
- [ ] Confirmar retorno à revisão no wizard com a campanha correta.
- [ ] Abrir uma campanha elegível, inclusive com pagamento pendente, e usar
  **Conteúdo com IA** nos detalhes ou ações, ou **Gerar com IA** no modal.
- [ ] No atalho do pagamento pendente, fechar o modal e conferir o retorno
  ao pagamento, sem mensagem de campanha concluída.
- [ ] Responder ao nome fantasia e briefing, gerar três textos, editar uma
  opção e salvar. Reabrir a campanha no módulo de IA e conferir o texto salvo.
- [ ] Se e-mail estiver ativo, conferir a entrega; caso contrário, demonstrar
  apenas a persistência e informar que o envio foi desligado para o teste.

Roteiro sugerido para o vídeo: mostrar o problema, criar campanha pelo chat,
mostrar o resumo e a revisão humana, abrir a criação de conteúdo da campanha,
gerar três opções, editar/salvar uma e mostrar a arquitetura e os dois fluxos
documentados no README. Não exibir tokens ou variáveis de ambiente na gravação.

As sondas de saúde não testam a validade da chave LLM, o catálogo remoto nem
o contrato de contexto. Esses pontos só ficam confirmados nos testes de negócio.

## Inventário de alterações desta entrega

Caminhos abaixo são relativos a `C:\Users\aryha\Documents\Ummix\plataforma`.

| Arquivo de destino | Alteração |
|---|---|
| `ai-api/README.md` | Apresentação do protótipo para o AKCIT Camp 2026, problema, roteiro de demonstração, inputs/lógica/outputs, autenticação, limites e opções de deploy |
| `ai-api/docs/REACTIVACAO-HACKATHON-2026-10-24.md` | Este diagnóstico, operação e inventário |
| `ai-api/docs/PORTAINER-VARIAVEIS-HOMOLOGACAO.md` | Lista de variáveis por stack, valores automáticos, build e instruções seguras para credenciais |
| `ai-api/deploy/portainer/docker-compose.yml` | Stack independente API, web e banco |
| `ai-api/deploy/portainer/.env.example` | Configuração pública sem credenciais reais |
| `ai-api/.env.example` | Documenta o novo controle de TLS do banco |
| `ai-api/.dockerignore` | Restringe o contexto de build e exclui credenciais/artefatos |
| `ai-api/src/config.ts` | Valida `DATABASE_SSL_ENABLED` |
| `ai-api/src/db/pool.ts` | Permite banco privado sem TLS quando explicitamente configurado |
| `ai-api/src/db/pool.test.ts` | Protege TLS padrão e transporte do banco Docker |
| `ai-api/migrations/004_audience_confirmation_metric_up.sql` | Aceita evento de confirmação do público |
| `ai-api/migrations/004_audience_confirmation_metric_down.sql` | Reversão transacional sem apagar métricas; recusa se houver eventos incompatíveis |
| `ai-web/Dockerfile` | Build Vite e entrega da SPA por Nginx |
| `ai-web/.dockerignore` | Evita segredos e artefatos locais no contexto Docker |
| `ai-web/README.md` | Documenta build Docker, flags e acesso por handoff |
| `ummix-front-develop/.env.ai-homolog.example` | Flags e URLs públicas para rebuild |
| `ummix-front-develop/docs/AI-HOMOLOGACAO.md` | Registro e paths da integração no repositório de terceiros |
| `ummix-front-develop/src/app/(private)/dashboard/page.tsx` | Restaura acesso à criação de campanha, loading e erro |
| `ummix-front-develop/src/app/(private)/dashboard/dashboardPage.test.tsx` | Verifica visibilidade conforme flag |
| `ummix-front-develop/src/app/(private)/campaigns/[id]/page.tsx` | Restaura conteúdo nos detalhes de campanha elegível |
| `ummix-front-develop/src/components/campaigns/CampaignActionsMenu.tsx` | Restaura ação de conteúdo com controle por flag/status |
| `ummix-front-develop/src/components/wizard/CampaignMaterialsPromptModal.tsx` | Restaura botão de gerar, loading e erro no modal |
| `ummix-front-develop/src/components/wizard/CampaignMaterialsPromptModal.test.tsx` | Atualiza o comportamento esperado de habilitação |
| `ummix-front-develop/src/components/wizard/steps/PaymentStep.tsx` | Restaura acesso no pagamento pendente e retorna ao pagamento ao fechar seu modal |
| `ummix-front-develop/src/services/campaignAiContentLauncher.ts` | Centraliza flag e elegibilidade visual do conteúdo |
| `ummix-front-develop/src/services/campaignAiContentLauncher.test.ts` | Verifica a política visual e o handoff existente |
| `ummix-front-develop/graphify-out/` | Mapa derivado regenerado (`graph.json`, `graph.html`, `GRAPH_REPORT.md`) e backup automático; não necessário ao deploy |

As cinco alterações de segmentação/confirmação que já estavam no `ai-api`
antes desta tarefa foram preservadas. No frontend principal, alterações
pré-existentes em `src/app/globals.css` e `src/lib/termsContent.txt` não fazem
parte da reativação. `graphify-out/` já existia e foi atualizado automaticamente
para refletir o código final; seus artefatos e backups não precisam ser
incluídos na publicação das aplicações.

## Estado de entrega

- Código/configuração/documentação preparados localmente, conforme as
  verificações abaixo.
- Nenhum commit, push, build de imagem no servidor, deploy ou alteração de
  secrets no Portainer foi realizado por esta preparação.
- DNS, registry/imagens disponíveis, secrets, subida e teste autenticado
  dependem do responsável com acesso à infraestrutura.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `ai-api`: `npm.cmd test -- --pool=threads --maxWorkers=1` | 17 arquivos, 118 testes aprovados |
| `ai-api`: `npm.cmd run build` | Aprovado |
| Frontend principal: testes focados dos launchers, modal, dashboard e detalhes | 5 arquivos, 23 testes aprovados |
| Frontend principal: `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Aprovado, separado do build que ignora erros de tipos |
| Frontend principal: `npm.cmd run build -- --webpack`, com as duas flags ativas | Aprovado |
| `ai-web`: `npm.cmd run build` | Aprovado |
| `docker compose --env-file deploy/portainer/.env.example -f deploy/portainer/docker-compose.yml config --quiet` | Sintaxe e interpolação aprovadas, sem subir serviços |
| `git diff --check` nos três repositórios | Sem erros; avisos de conversão LF/CRLF do Windows |
| Links locais dos READMEs e guias | 6 links verificados, nenhum destino ausente |
| `graphify update .` no frontend principal | Concluído: 1.208 nós, 2.548 relações e 89 comunidades |

As primeiras execuções tiveram timeout de um worker do frontend e de uma
sonda da API. Os casos passaram isoladamente e depois nas execuções finais,
sem aumentar timeouts no código. O teste de TLS foi executado antes da
correção e reproduziu a tentativa indevida de TLS no banco Docker.

O Docker local está sem daemon, portanto **não foram validados builds de
imagem, execução das migrations em PostgreSQL real ou a stack em execução**.
O build NPM do `ai-web` foi validado no checkout existente; a tentativa de
instalação isolada do agente encontrou falha local de symlink/permissão.
O comportamento de `npm ci` dentro da imagem Linux permanece para validação
no Docker host. Nenhuma credencial real de provedor ou login foi usada em
teste de negócio de homologação nesta entrega.

Agentes concluíram o mapeamento dos dois fluxos e a preparação Docker do
`ai-web`. A revisão final adicional do agente foi interrompida pelo limite
de uso da conta; a revisão final dos diffs foi feita diretamente. O comando
`graphify update .` foi executado, mas interrompido depois da extração AST;
não se considera o mapa global atualizado. Uma execução posterior restrita ao
frontend principal concluiu a atualização de seu mapa. A extração global indicou ausência
do parser SQL opcional. Esses limites não são validação da aplicação publicada.
