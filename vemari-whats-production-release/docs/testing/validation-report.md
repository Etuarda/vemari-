# Relatório de validação do pacote

Data de validação: 15 de julho de 2026.

## Verificações executadas

- ESLint em API, frontend, worker e pacotes compartilhados: aprovado sem warnings.
- TypeScript em modo estrito no pacote raiz consolidado: aprovado.
- Testes unitários executados: 13 aprovados.
  - política de campanhas;
  - consentimento e contatos;
  - formatação do frontend;
  - mapeamento de status da Meta;
  - matriz de permissões;
  - assinatura de webhook.
- Builds executados:
  - contratos compartilhados;
  - cliente Meta;
  - API NestJS;
  - worker BullMQ;
  - frontend React/Vite.
- `npm audit --audit-level=high --omit=dev`: 0 vulnerabilidades encontradas.

## Limites da validação local

O ambiente de geração não disponibilizou Docker Engine nem credenciais reais da Meta. Por isso, permanecem obrigatórios em staging:

- subir `docker compose` completo;
- executar migrations em PostgreSQL limpo;
- testar backup e restore;
- configurar WABA, número, System User Token e billing;
- validar webhook público e assinado;
- enviar template real e observar `sent`, `delivered`, `read` e `failed`;
- concluir o checklist em `docs/testing/homologation-checklist.md`.

O pacote não deve ser promovido diretamente para produção sem essa homologação externa.
