# Release 1.0.0 — cenário interno Vemari

## Entregue no código

- monorepo com React, NestJS/Fastify, worker BullMQ e pacotes compartilhados;
- PostgreSQL/Prisma, migrations e seed controlado;
- administrador, gestor, supervisor, atendente e leitura;
- login Argon2id, access token curto, refresh token rotativo e bloqueio de tentativas;
- RBAC aplicado no backend;
- auditoria append-only com triggers contra alteração e exclusão;
- filtros e exportação CSV de auditoria;
- contatos, consentimento, supressão, templates, campanhas e inbox;
- filas Redis/BullMQ, retry, backoff e dead-letter;
- WebSocket com isolamento por organização;
- adapter oficial da Graph API com `appsecret_proof`;
- webhook com verificação de token, assinatura HMAC e idempotência;
- processamento de mensagens, status e opt-out;
- logs com redaction, métricas Prometheus e health checks;
- Docker, HTTPS por Caddy, backup/restore, alertas, CI/CD e runbooks;
- interface clean e responsiva, sem simulador e sem dados de Sienge.

## Ações externas que a Vemari precisa concluir

O código não pode executar sozinho ações administrativas do ecossistema Meta. Antes da produção, a Vemari deve:

1. criar ou selecionar o Business Portfolio e o aplicativo empresarial;
2. habilitar o produto WhatsApp;
3. obter WABA ID, Phone Number ID, App ID e App Secret;
4. configurar o webhook público e assinar o campo `messages`;
5. criar System User Token com as permissões necessárias;
6. registrar o número real e definir o PIN de verificação em duas etapas;
7. configurar billing;
8. criar e aprovar templates de marketing;
9. realizar homologação controlada em staging;
10. preencher secrets, domínio, backup externo e alertas.

Consulte `docs/meta/` e `docs/testing/homologation-checklist.md`.
