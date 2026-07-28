# Sistema de Votação

Aplicação web para gerenciamento de assembleias, eleitores, pautas, votos, perguntas e apuração de resultados.

Os usuários ficam no cadastro geral, mas a autorização para votar é definida individualmente em cada assembleia. Uma assembleia nova começa sem eleitores; o administrador deve associar seu eleitorado antes da abertura. A votação só começa quando o administrador aciona **Iniciar Assembleia**; o horário programado não abre a assembleia automaticamente.

Na página administrativa da assembleia, o botão **Adicionar em lote** permite selecionar vários usuários do cadastro geral ou colar um CSV no formato `Nome; CPF; Data de nascimento; WhatsApp; Diretoria (Sim/Não)`. CPFs já cadastrados são atualizados e vinculados; novos CPFs são criados e vinculados automaticamente. Inclusões e correções continuam disponíveis enquanto a assembleia estiver aberta.

> O projeto ainda está em fase de MVP. Antes de uso em uma assembleia real, conclua as etapas de segurança, integridade e auditoria descritas no roadmap do projeto.

## Tecnologias

- Next.js 16 e React 19
- TypeScript
- Prisma ORM
- SQLite para desenvolvimento local
- JWT em cookie HTTP-only
- CSS próprio

## Pré-requisitos

- Node.js 20.9 ou superior
- npm

## Configuração local

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Copie o arquivo de exemplo e configure as variáveis:

   ```bash
   cp .env.example .env
   ```

3. Aplique as migrações:

   ```bash
   npx prisma migrate dev
   ```

4. Opcionalmente, carregue os dados de demonstração:

   ```bash
   npm run seed
   ```

   O seed recria os dados de usuários, votos, pautas e assembleias do banco configurado. Não o execute sobre dados que precisem ser preservados.

5. Inicie o servidor:

   ```bash
   npm run dev
   ```

A aplicação estará disponível em [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL de conexão usada pelo Prisma. Para o SQLite local, use `file:./dev.db`. |
| `JWT_SECRET` | Produção | Segredo utilizado para assinar sessões. Use um valor longo, aleatório e exclusivo por ambiente. |
| `TWILIO_ACCOUNT_SID` | Produção | Identificador da conta Twilio usada pelo 2FA. |
| `TWILIO_AUTH_TOKEN` | Produção | Credencial da conta Twilio. |
| `TWILIO_WHATSAPP_FROM` | Produção | Remetente WhatsApp habilitado no Twilio. |

O caminho SQLite é resolvido a partir de `prisma/schema.prisma`; portanto, `file:./dev.db` aponta para `prisma/dev.db`.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o ambiente de desenvolvimento. |
| `npm run lint` | Executa as regras de qualidade do ESLint. |
| `npm run typecheck` | Valida os tipos sem gerar arquivos. |
| `npm run build` | Gera a compilação de produção. |
| `npm run check` | Executa lint, tipos e build em sequência. |
| `npm run test:security` | Executa o smoke test de segurança contra um servidor local na porta configurada. |
| `npm run create-admin` | Cria o administrador inicial sem carregar dados de demonstração. |
| `npm run seed` | Recria os dados de demonstração no banco configurado. |
| `npm start` | Inicia uma compilação de produção existente. |

## Deploy em VPS

O projeto inclui um instalador para Ubuntu 24.04 que configura Node.js, Nginx,
systemd, HTTPS, backups e uma base de produção vazia. Consulte o
[guia completo de deploy](./DEPLOY.md).

O instalador baixa o código do GitHub e executa somente as migrações. O banco
local e os dados de demonstração não são enviados à VPS.

## Estrutura principal

```text
prisma/
  migrations/       Migrações do banco
  schema.prisma     Modelos Prisma
  seed.ts           Dados locais de demonstração
src/
  app/
    admin/           Painel administrativo
    api/             Rotas HTTP do backend
    login/           Autenticação
    perguntas/       Envio público de perguntas
    plenario/        Apuração para plenário
    votar/           Jornada do eleitor
  lib/               Autenticação, Prisma e utilitários
```

## Banco de dados

Arquivos `.db` são dados locais e não devem ser adicionados ao Git. Para verificar as migrações:

```bash
npx prisma validate
npx prisma migrate status
```

O instalador de VPS mantém um SQLite separado e protegido para a primeira versão
de produção. A migração para PostgreSQL é recomendada para maior concorrência,
alta disponibilidade ou crescimento do volume de votos.

### Teste de segurança

O smoke test espera um banco isolado carregado pelo seed e um servidor local em execução. Por padrão ele usa `http://localhost:3100`; outro endereço pode ser informado com `SMOKE_BASE_URL`. O teste valida 2FA de uso único, sessão revogável, voto único, sigilo da parcial e preservação de pauta votada.

## Controles de segurança implementados

- Sessões revogáveis e vinculadas ao usuário atual do banco.
- 2FA de uso único, com expiração de cinco minutos e limite de tentativas.
- Envio por WhatsApp via Twilio em produção; em desenvolvimento, o código é exibido apenas no servidor e na tela local.
- Rate limiting persistente para login, votos e perguntas.
- Protocolo único por participação em cada assembleia.
- Eleitorado independente por assembleia, com inclusão e correção permitidas
  durante a abertura e trilha de auditoria.
- Bloqueio de exclusão de usuários, pautas e assembleias que possuam histórico de votação.
- Resultados parciais ocultos, salvo liberação explícita do administrador.
- Registro de eventos administrativos e de votação em trilha de auditoria.

Esses controles reduzem os principais riscos do MVP, mas não substituem revisão jurídica, política LGPD, monitoramento, testes de carga e auditoria externa antes de uma votação com valor jurídico.
