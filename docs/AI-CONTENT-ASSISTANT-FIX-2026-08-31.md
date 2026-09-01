# Correção do AI Content Assistant — 2026-08-31

## Escopo

Esta entrega altera somente os repositórios independentes `ai-api` e `ai-web`.
Não foram alterados `services`, `web` ou `admin`.

O objetivo é corrigir o erro ao salvar o texto escolhido e alinhar a exibição da conversa enquanto a próxima pergunta é processada.

## Diagnóstico confirmado do erro 500

O gerador cria o identificador de cada opção usando `randomUUID()`. Um UUID possui 36 caracteres. O schema original do banco definia `campaign_content.contents.selected_option_id` como `VARCHAR(32)`.

Quando o cliente salvava uma opção, o `UPDATE` tentava gravar o UUID completo e o PostgreSQL rejeitava a operação com erro de tamanho (`SQLSTATE 22001`, valor maior que `character varying(32)`). A API convertia a falha não tratada em `500 — Erro interno do conteúdo de campanha`.

A correção aumenta a coluna para `VARCHAR(80)`, mantém o schema de uma instalação nova alinhado e adiciona uma migration para bancos já existentes. O `ai-api` executa as migrations no início do container, portanto o Render precisa fazer um novo deploy do `ai-api` para aplicar a alteração.

## Arquivos alterados ou adicionados

### `ai-api`

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\migrations\002_campaign_content_up.sql`
  - Ajusta o schema inicial para aceitar IDs das opções com até 80 caracteres.
  - Usa `clock_timestamp()` para registrar a ordem real de inserção das mensagens.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\migrations\003_campaign_content_runtime_fixes_up.sql`
  - Nova migration para bancos já criados.
  - Altera `selected_option_id` para `VARCHAR(80)` e atualiza o default de `created_at` das mensagens.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\migrations\003_campaign_content_runtime_fixes_down.sql`
  - Rollback da migration 003.
  - O rollback não trunca valores: se já houver UUID com mais de 32 caracteres, o banco rejeitará a redução com segurança.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\db\migrations.test.ts`
  - Teste que garante a presença dos ajustes da migration 003.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\db\session-repository.ts`
  - Registra explicitamente o horário real das mensagens do cliente e do assistente.
  - Ordena as mensagens por data, com desempate determinístico para manter cada resposta junto da pergunta correspondente.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\routes\campaign-content-routes.ts`
  - Registra falhas internas com `requestId`, operação, código seguro do erro e IDs da campanha/sessão/geração.
  - Não registra token, resposta do cliente ou texto final.
  - Mantém a mensagem pública genérica para não expor detalhes internos.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-api\src\modules\campaign-content\routes\campaign-content-routes.test.ts`
  - Teste que garante o diagnóstico seguro de uma falha interna sem vazar o texto enviado pelo cliente.

### `ai-web`

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-web\src\components\CampaignContentPage.tsx`
  - Mostra imediatamente a resposta do cliente enquanto a API prepara a próxima pergunta.
  - Exibe o indicador de processamento na sequência correta.
  - Ignora respostas antigas da API que possam sobrescrever uma sessão mais nova.
  - Evita salvar um rascunho cuja versão ficou desatualizada.
  - Desabilita ações concorrentes durante envio, geração e salvamento.
  - Mantém o texto editado na tela após falha e oferece “Tentar salvar novamente”.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-web\src\components\CampaignContentPage.test.tsx`
  - Testa a exibição imediata da resposta do cliente.
  - Testa a retenção do texto e a nova tentativa após um erro 500 no salvamento.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-web\src\api.ts`
  - Trata respostas que não são JSON, como páginas HTML de erro 502/500, sem gerar um segundo erro de parsing no navegador.
  - Apresenta uma mensagem de indisponibilidade adequada quando a API não devolve uma mensagem estruturada.

- `C:\Users\aryha\Documents\Ummix\plataforma\ai-web\src\styles.css`
  - Diferencia visualmente a mensagem que está aguardando confirmação da API.
  - Estiliza a ação de nova tentativa dentro do aviso de erro.

## Procedimento de publicação

1. No repositório `ai-api`, revisar os arquivos acima, criar o commit e enviar para a branch publicada pelo Render.
2. Fazer o redeploy do serviço `ummix-ai-api-homol` no Render. A migration 003 deve aparecer na execução de inicialização antes do servidor ficar pronto.
3. No repositório `ai-web`, revisar os arquivos acima, criar o commit e enviar para a branch conectada ao Vercel.
4. Fazer o deploy do Vercel e abrir uma campanha de teste.

Não é necessário novo commit nem rebuild nos repositórios de terceiros para esta correção.

## Checklist de homologação

- Abrir o AI Content Assistant por uma campanha existente.
- Responder uma pergunta e confirmar que a resposta aparece imediatamente como mensagem do cliente.
- Confirmar que a próxima pergunta só aparece depois da resposta do assistente.
- Gerar as três opções.
- Editar uma opção e clicar em “Salvar texto”.
- Confirmar que o `PUT /api/campaigns/{campaignId}/ai-content/sessions/{sessionId}/selection` retorna sucesso e que a tela mostra “Texto salvo”.
- Em caso de falha temporária, confirmar que o texto editado permanece na tela e que “Tentar salvar novamente” funciona.
- Se houver nova falha no Render, procurar o log `[campaign-content-diagnostic] internal failure` e correlacionar pelo `requestId`; o log não deve conter o texto final nem tokens.

## Validação local executada

- `ai-api`: `npm.cmd test` — 16 arquivos e 101 testes aprovados.
- `ai-web`: `npm.cmd test` — 5 arquivos e 20 testes aprovados.
- `ai-api`: `npm.cmd run build` — aprovado.
- `ai-web`: `npm.cmd run build` — aprovado.
- `git diff --check` — sem erro de whitespace; o Git apenas reportou o aviso esperado de conversão LF/CRLF do Windows.
- `graphify update .` não pôde ser executado neste ambiente por `uv trampoline failed to canonicalize script path`; isso não alterou o código nem invalida os testes acima.

## Estado de commit

Nenhum commit ou push foi feito por esta entrega. Os dois repositórios estão preparados para revisão e commit manual.
