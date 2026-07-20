# Arquitetura do sistema

## Decisão

O backend é um monólito modular NestJS com Fastify. Workers BullMQ são processos separados, mas compartilham contratos e banco. Essa topologia reduz complexidade operacional para uso exclusivo da Vemari e permite escalar API e workers independentemente.

## Módulos

- `auth`: login, sessões e bloqueio;
- `users`: administração de contas e papéis;
- `contacts`: contatos, consentimentos, supressão e CSV;
- `templates`: sincronização de templates oficiais;
- `campaigns`: validação, snapshot e execução;
- `conversations`: inbox, atribuição, transferência e mensagens;
- `whatsapp`: Graph API e webhooks;
- `audit`: trilha append-only e exportação;
- `analytics`: indicadores operacionais;
- `realtime`: eventos Socket.IO;
- `metrics` e `health`: operação.

## Princípios

- controllers não chamam a Graph API diretamente;
- toda autorização é verificada no backend;
- campanhas e webhooks são processados assincronamente;
- dados financeiros e Sienge não existem no MVP;
- o frontend não define remetente nem eventos de sistema;
- mensagens e eventos são idempotentes;
- auditoria é append-only no banco.
