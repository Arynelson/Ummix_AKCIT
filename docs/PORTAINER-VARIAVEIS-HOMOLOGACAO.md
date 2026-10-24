# Variáveis do Portainer — IA em homologação

Conferido nos arquivos locais em 24/10/2026. Este guia não confirma que os
domínios, imagens ou credenciais já estejam disponíveis no servidor.

Use com [`../deploy/portainer/docker-compose.yml`](../deploy/portainer/docker-compose.yml)
em Docker Standalone/Compose. Se o Portainer usar Swarm, o responsável pela
infraestrutura precisa adaptar a stack antes da publicação.

## 1. Stack nova: `ummix-ai-homol`

No Portainer, crie a stack com o compose indicado e preencha sua seção de
variáveis de ambiente com os valores abaixo. Substitua todos os valores
`SUBSTITUIR_...`: eles são instruções, não credenciais utilizáveis.

```dotenv
AI_API_IMAGE=ummix-ai-api:hackathon-2026-10-24
AI_WEB_IMAGE=ummix-ai-web:hackathon-2026-10-24

AI_API_HOST=ai-api-homol.workingtech.com.br
AI_WEB_HOST=ai-homol.workingtech.com.br
TRAEFIK_NETWORK=proxy_shared_01
TRAEFIK_CERTRESOLVER=letsencrypt

UMMIX_API_URL=https://ummix.workingtech.com.br/api
UMMIX_WEB_URL=https://ummix.workingtech.com.br

AI_POSTGRES_PASSWORD=SUBSTITUIR_POR_SENHA_HEXADECIMAL_ALEATORIA
UMMIX_SERVICE_TOKEN=SUBSTITUIR_PELO_TOKEN_VALIDO_DE_HOMOLOGACAO
AI_HANDOFF_ENCRYPTION_KEY=SUBSTITUIR_POR_CHAVE_BASE64_DE_32_BYTES
OPENAI_API_KEY=SUBSTITUIR_PELA_CHAVE_DO_PROVEDOR
OPENAI_MODEL=gpt-5.6-luna

CAMPAIGN_ASSISTANT_ENABLED=true
CAMPAIGN_CONTENT_ENABLED=true

CAMPAIGN_CONTENT_EMAIL_ENABLED=false
CAMPAIGN_CONTENT_ADMIN_EMAILS=falecoma@ummix.com.br,tecnologia@ummix.com.br
CAMPAIGN_CONTENT_EMAIL_API_KEY=
CAMPAIGN_CONTENT_EMAIL_FROM=
CAMPAIGN_CONTENT_EMAIL_FROM_NAME=Ummix Ads
```

### O que precisa ser confirmado ou preenchido

| Variável | Como preencher |
|---|---|
| `AI_API_IMAGE` / `AI_WEB_IMAGE` | As tags do exemplo só funcionam se as imagens tiverem sido construídas no mesmo host Docker do Portainer. Se vierem de um registry, substituir pelo endereço completo das imagens e configurar acesso ao registry. |
| `AI_API_HOST` / `AI_WEB_HOST` | Domínios sugeridos, ainda dependentes de confirmação e DNS. Preencher sem `https://`, sem barra e sem caminho. |
| `TRAEFIK_NETWORK` | Nome da rede externa já existente no servidor. `proxy_shared_01` é o padrão observado no compose do frontend principal. |
| `TRAEFIK_CERTRESOLVER` | Nome do resolvedor de certificados existente no Traefik. Confirmar `letsencrypt`; a stack também pressupõe entrypoint `websecure`. |
| `AI_POSTGRES_PASSWORD` | Senha exclusiva do banco da IA. Gerar 32 bytes aleatórios em hexadecimal, conforme abaixo. Não usar a senha do banco principal. |
| `UMMIX_SERVICE_TOKEN` | Somente o valor do token aceito pelo backend de homologação. Deve coincidir com o `SERVICE_TOKEN` do services atual. Não acrescentar `x-service-token:`, `Bearer` ou aspas ao valor no formulário. |
| `AI_HANDOFF_ENCRYPTION_KEY` | Base64 de 32 bytes aleatórios. Se continuar usando o banco anterior da IA, preservar a chave anterior para não perder a capacidade de descriptografar dados existentes. Guardar em local protegido. |
| `OPENAI_API_KEY` | Chave existente e válida do provedor, com acesso ao modelo configurado. Preencher diretamente no Portainer; não enviar a chave no chat nem no Git. |
| `OPENAI_MODEL` | `gpt-5.6-luna` é o identificador configurado no projeto. A disponibilidade desse identificador na conta/provedor não foi validada nesta conferência; se for recusado, confirmar um identificador aceito antes de trocar. |

Não coloque credenciais nas variáveis públicas `NEXT_PUBLIC_*` ou `VITE_*`.

### Gerar senha e chave no PowerShell clássico

Execute no seu computador. As saídas são segredos: copie apenas para o
Portainer e para um gerenciador de senhas. Não grave essa tela no vídeo.

Chave de handoff:

```powershell
$handoffBytes = New-Object byte[] 32
$handoffGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $handoffGenerator.GetBytes($handoffBytes) } finally { $handoffGenerator.Dispose() }
[Convert]::ToBase64String($handoffBytes)
```

Senha hexadecimal do banco:

```powershell
$databaseBytes = New-Object byte[] 32
$databaseGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $databaseGenerator.GetBytes($databaseBytes) } finally { $databaseGenerator.Dispose() }
[BitConverter]::ToString($databaseBytes).Replace('-', '').ToLowerInvariant()
```

A senha hexadecimal evita caracteres reservados na URL de conexão. Após a
primeira inicialização do PostgreSQL, mudar `AI_POSTGRES_PASSWORD` na stack
não altera a senha gravada no banco. Não apague o volume para trocar senha.

### Valores que o compose já define automaticamente

Não precisa cadastrar estes itens separadamente nas variáveis da stack:

| Container | Variável | Valor definido pelo compose |
|---|---|---|
| PostgreSQL | `POSTGRES_DB` | `ummix_ai_homol` |
| PostgreSQL | `POSTGRES_USER` | `ummix_ai` |
| PostgreSQL | `POSTGRES_PASSWORD` | Valor de `AI_POSTGRES_PASSWORD` |
| ai-api | `NODE_ENV` | `production` |
| ai-api | `HOST` | `0.0.0.0` |
| ai-api | `PORT` | `10000` |
| ai-api | `DATABASE_URL` | `postgresql://ummix_ai:SENHA@postgres:5432/ummix_ai_homol`, montada com a senha informada |
| ai-api | `DATABASE_SSL_ENABLED` | `false`, somente para o banco privado desta stack Docker |
| ai-api | `AI_WEB_ORIGIN` | `https://` seguido de `AI_WEB_HOST` |

Não reutilize o hostname antigo do banco Render nesta stack. O banco fica na
rede privada Docker, sem publicar a porta 5432. Um banco novo não traz os
textos e sessões antigos da IA; não modifica o banco principal da plataforma.

## 2. Build da imagem do `ai-web`

Estas variáveis precisam ser passadas como **argumentos de build**, antes de
construir a imagem do `ai-web`. Não basta cadastrá-las no container Nginx:

```dotenv
VITE_AI_API_URL=https://ai-api-homol.workingtech.com.br
VITE_UMMIX_WEB_URL=https://ummix.workingtech.com.br
VITE_CAMPAIGN_ASSISTANT_ENABLED=true
VITE_CAMPAIGN_CONTENT_ENABLED=true
```

Na raiz do repositório `ai-web`, com os domínios já confirmados:

```sh
docker build --build-arg VITE_AI_API_URL=https://ai-api-homol.workingtech.com.br --build-arg VITE_UMMIX_WEB_URL=https://ummix.workingtech.com.br --build-arg VITE_CAMPAIGN_ASSISTANT_ENABLED=true --build-arg VITE_CAMPAIGN_CONTENT_ENABLED=true -t ummix-ai-web:hackathon-2026-10-24 .
```

Na raiz do repositório `ai-api`:

```sh
docker build -t ummix-ai-api:hackathon-2026-10-24 .
```

Executar os builds no host Docker do Portainer ou publicar as imagens em um
registry acessível a ele. O compose da IA usa imagens prontas; não compila os
repositórios automaticamente. Trocar as variáveis da stack não reconstrói a imagem.

## 3. Stack existente do frontend principal: `ummix-front-develop`

Adicionar/atualizar as cinco variáveis abaixo na configuração de build do
frontend principal. Preservar as demais variáveis existentes da plataforma.

```dotenv
NEXT_PUBLIC_AI_API_URL=https://ai-api-homol.workingtech.com.br
NEXT_PUBLIC_AI_WEB_URL=https://ai-homol.workingtech.com.br
NEXT_PUBLIC_CAMPAIGN_ASSISTANT_API_URL=https://ai-api-homol.workingtech.com.br/api/campaign-assistant
NEXT_PUBLIC_CAMPAIGN_ASSISTANT_ENABLED=true
NEXT_PUBLIC_CAMPAIGN_CONTENT_ENABLED=true
```

O Dockerfile e o compose locais já encaminham essas chaves como argumentos
de build. É necessário **reconstruir e publicar a imagem do frontend**;
reiniciar o container antigo não basta. Se a stack real usa uma imagem pronta,
esses argumentos devem entrar no processo que constrói essa imagem.

Para o compose local do frontend, manter também a configuração existente:

| Variável | Valor / orientação |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://ummix.workingtech.com.br/api` para esta homologação; preservar o valor equivalente já funcional no servidor. Não apontar para a API de IA. |
| `FRONT_DOMAIN` | `ummix.workingtech.com.br`, se este continuar sendo o domínio do frontend principal. |
| `PROJECT_NAME` | Preservar o nome atual da stack; o compose usa `ummix` como padrão se estiver ausente. Não mudar nomes de containers/redes existentes sem planejar. |

O compose já define `PORT=3004` e `TZ=America/Sao_Paulo` para esse frontend.

## 4. Backend principal: `ummix-back-develop`

Não é necessário alterar seu código para esta reativação. Conferir com o
responsável que o **`SERVICE_TOKEN` existente** corresponde ao
`UMMIX_SERVICE_TOKEN` informado na IA. Não trocar o token principal sem
avaliar outras integrações que o utilizam.

O adapter existente de contexto de campanha precisa estar publicado e
funcionando; flags na IA não corrigem um adapter ausente ou com erro no services.

## 5. E-mail: desligado na demonstração ou envio real

O bloco inicial deixa `CAMPAIGN_CONTENT_EMAIL_ENABLED=false`. Assim, permite
demonstrar a geração e o salvamento sem disparar e-mails administrativos reais.
**Isso não demonstra nem habilita o envio por e-mail solicitado para o produto.**

Para testar envio real, preencher no Portainer:

| Variável | Valor |
|---|---|
| `CAMPAIGN_CONTENT_EMAIL_ENABLED` | `true` |
| `CAMPAIGN_CONTENT_EMAIL_API_KEY` | Chave válida da Brevo configurada para esse envio |
| `CAMPAIGN_CONTENT_EMAIL_FROM` | E-mail de remetente autorizado na conta Brevo |
| `CAMPAIGN_CONTENT_EMAIL_FROM_NAME` | `Ummix Ads` |
| `CAMPAIGN_CONTENT_ADMIN_EMAILS` | `falecoma@ummix.com.br,tecnologia@ummix.com.br` |

A API usa por padrão `https://api.brevo.com/v3/smtp/email` e timeout de
`10000` ms. Não é necessário cadastrá-los. Campos adicionais só chegam ao
container se forem explicitamente encaminhados em `services.ai-api.environment`;
cadastrá-los apenas no formulário da stack não faz esse encaminhamento.

## 6. Outros padrões: não precisam ser cadastrados

A API já adota estes valores quando as variáveis não são fornecidas:

| Variável | Padrão |
|---|---|
| `AI_HANDOFF_TTL_SECONDS` | `60` |
| `SESSION_TTL_MINUTES` | `120` |
| `MESSAGE_LIMIT_PER_WINDOW` | `20` |
| `MESSAGE_WINDOW_MINUTES` | `10` |
| `CAMPAIGN_CONTENT_LENGTH_POLICY_VERSION` | `pt-br-v1` |
| `CAMPAIGN_CONTENT_MIN_WORDS_PER_SECOND` | `2.2` |
| `CAMPAIGN_CONTENT_MAX_WORDS_PER_SECOND` | `2.6` |

Essas opções não são interpoladas pelo compose atual. Para sobrescrevê-las,
o responsável deve adicioná-las ao `environment` do serviço `ai-api`.

## 7. Conferência final

- Domínios confirmados, DNS apontado e HTTPS emitido; atualizar todos os
  blocos e builds se o responsável escolher outros hosts.
- Imagens atualizadas disponíveis no host/registry e stack publicada.
- PostgreSQL, ai-api e ai-web saudáveis no Portainer.
- `/health` e `/ready` respondem na API de IA; o readiness verifica o banco,
  não a validade da chave do modelo ou todas as integrações externas.
- Login na plataforma principal, botão abre o chat, criação de campanha,
  geração de conteúdo e salvamento testados com um usuário real de homologação.

Esta entrega documenta a configuração; não instala nem publica a stack.
