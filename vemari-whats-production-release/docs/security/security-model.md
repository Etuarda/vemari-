# Modelo de segurança

## Papéis

| Papel | Uso |
|---|---|
| `ADMIN` | usuários, integração Meta, auditoria e todas as funções |
| `MARKETING_MANAGER` | contatos, templates e campanhas |
| `SUPERVISOR` | todas as conversas, atribuição e operação |
| `ATTENDANT` | fila disponível e conversas próprias |
| `READ_ONLY` | consultas operacionais permitidas |

A matriz efetiva está em `apps/backend/src/shared/contracts/index.ts` e é validada pelo `PermissionsGuard`.

## Autenticação

- senha Argon2id;
- limite de tentativas e bloqueio temporário;
- access token curto;
- refresh token aleatório, armazenado somente como hash;
- rotação de refresh token;
- cookie HttpOnly, Secure e SameSite Strict em produção;
- logout revoga sessão;
- reset administrativo revoga todas as sessões.

## Proteções HTTP

- Helmet;
- CORS por allowlist;
- validação whitelist de DTOs;
- body e upload limitados;
- rate limit global e específico no login;
- logs com redaction;
- containers sem privilégio e filesystem read-only;
- TLS no proxy.

## Credenciais Meta

Nunca devem ser enviadas ao frontend ou persistidas em logs. Use secret manager. O App Secret é usado para `appsecret_proof` e para validar `X-Hub-Signature-256`.
