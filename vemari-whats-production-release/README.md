# Vemari Whats Platform

Plataforma interna da Vemari para campanhas de marketing e atendimento humano pela WhatsApp Business Platform.

## Estado do pacote

Este repositório entrega uma **base de produção** com arquitetura modular, segurança, auditoria, filas, WebSocket, observabilidade, containers e integração oficial preparada. Ele não contém credenciais reais da Meta e não cria automaticamente o Business Portfolio, o aplicativo, o número, o billing ou a aprovação dos templates. Essas etapas dependem de ações administrativas externas e estão descritas em `docs/meta/`.

## Escopo

Incluído:

- administrador, gestor, supervisor, atendente e leitura;
- login com Argon2id, JWT curto e refresh token rotativo em cookie HttpOnly;
- RBAC validado no backend;
- PostgreSQL e Prisma;
- contatos, consentimento e supressão;
- templates sincronizados da Meta;
- campanhas com snapshot, idempotência e BullMQ;
- webhooks oficiais assinados;
- status `sent`, `delivered`, `read` e `failed`;
- inbox com atribuição, transferência, notas internas e WebSocket;
- auditoria append-only, filtros e CSV;
- logs estruturados, Prometheus e health checks;
- HTTPS automático por Caddy;
- backup, restore, CI e runbooks.

Fora do escopo atual:

- Sienge, boletos, parcelas e contratos;
- agente de IA autônomo;
- onboarding SaaS de outras empresas;
- criação automática do aplicativo Meta e contratação de billing.

## Arquitetura

O repositório usa um único `package.json` e um único `package-lock.json`. O backend continua
modular, enquanto API (`main-api.ts`) e worker (`main-worker.ts`) são compilados e executados
como processos independentes.

As configurações de ferramentas também são únicas e ficam na raiz, seguindo os nomes
convencionais reconhecidos automaticamente pelo ecossistema: `tsconfig.json`,
`eslint.config.mjs`, `prettier.config.mjs`, `vite.config.ts`, `vitest.config.ts`,
`playwright.config.ts`, `Dockerfile` e `docker-compose.yml`. O único `Dockerfile` usa targets
multi-stage separados para backend e frontend. A API e o worker compartilham a validação de
ambiente definida em `apps/backend/src/shared/config.ts`.

```text
apps/web/                  React + Vite
apps/backend/src/modules/ NestJS modular
apps/backend/src/workers/ Processadores BullMQ
apps/backend/src/shared/  Contratos e integrações compartilhadas
prisma/                    Schema, migrations e seed
tests/                     Testes unitários, integração e e2e
infra/                     Proxy, observabilidade e scripts operacionais
```

```text
Browser
  │ HTTPS / WebSocket
  ▼
Caddy ──► React/Vite
  │
  └─────► NestJS + Fastify
              │
        ┌─────┴─────────┐
        ▼               ▼
   PostgreSQL       Redis/BullMQ
                        │
                        ▼
                      Worker
                        │
                        ▼
                Meta Graph API
```

## Requisitos

- Docker Engine 26+ e Docker Compose v2;
- domínio apontado para o servidor;
- conta Meta Business da Vemari;
- WABA e número habilitado;
- token de System User;
- templates aprovados;
- servidor Linux com backup externo.

## Inicialização local

### Aplicação no host e infraestrutura no Docker

```bash
npm ci
npm run local:setup
npm run dev
```

Esse modo publica PostgreSQL em `localhost:15432` e Redis em `localhost:16379`, evitando
conflitos com instalações locais nas portas padrão. A aplicação fica em
`http://localhost:5173` e a API em `http://localhost:3000`.

O projeto fixa `registry.npmjs.org` em `.npmrc`. Scripts automáticos de instalação ficam
desabilitados para tornar o `npm ci` reproduzível e reduzir risco de supply chain; a geração
necessária do Prisma é executada explicitamente por `local:setup` e pelo build.

### Aplicação completa no Docker

```bash
docker compose up --build
```

Acesse `http://localhost:8080`. O Caddy fica desativado no ambiente local e só é iniciado
explicitamente em produção:

```bash
docker compose --profile production up -d --build
```

Antes de produção, substitua todos os valores locais de `.env`, especialmente senhas,
segredos JWT, chave de criptografia, domínio e credenciais da Meta.

## Segredos

Gere valores fortes:

```bash
openssl rand -base64 64   # JWT_ACCESS_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY_BASE64
openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN
```

Não faça commit do `.env`. Em produção, use secret manager do provedor ou secrets do orquestrador.

## Banco e usuários

O serviço `migrate` executa migrations e o seed estrutural. Em uma instalação nova, crie o primeiro administrador com `npm run auth:bootstrap-admin -- --email admin@vemari.com.br`; o comando retorna um link de ativação de uso único e não cria nem armazena senha no `.env`.

```bash
docker compose run --rm migrate
```

## Validação

```bash
npm ci
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --audit-level=high
```

## Meta

Siga, nesta ordem:

1. `docs/meta/01-test-environment.md`;
2. `docs/meta/02-production-number.md`;
3. `docs/meta/03-templates-and-billing.md`;
4. `docs/testing/homologation-checklist.md`.

## Operação

- saúde da API: `/api/v1/health/live` e `/api/v1/health/ready`;
- métricas da API: `/api/v1/metrics`;
- saúde do worker: porta interna `3001`;
- monitoramento opcional: `docker compose --profile monitoring up -d`;
- backup: `infra/scripts/backup-postgres.sh`;
- restore: `infra/scripts/restore-postgres.sh`.

## Documentação

- [Arquitetura](docs/architecture/system.md)
- [Segurança e RBAC](docs/security/security-model.md)
- [Auditoria](docs/security/audit.md)
- [Meta em teste](docs/meta/01-test-environment.md)
- [Número real](docs/meta/02-production-number.md)
- [Templates e billing](docs/meta/03-templates-and-billing.md)
- [Deploy](docs/runbooks/deployment.md)
- [Rollback](docs/runbooks/rollback.md)
- [Incidentes](docs/runbooks/incident-response.md)
- [Homologação](docs/testing/homologation-checklist.md)
