# Templates, billing e preços

## Templates

Crie e envie templates pelo WhatsApp Manager. A plataforma sincroniza apenas o que a Meta retornar. Campanhas são bloqueadas quando o template não for `MARKETING` e `APPROVED`.

Antes de usar:

- confirme idioma;
- valide quantidade e ordem das variáveis;
- revise links e botões;
- teste com contato interno;
- monitore status e qualidade.

## Cloud API e Marketing Messages API

A Cloud API é obrigatória para receber respostas e manter o inbox. `META_USE_MARKETING_MESSAGES_API=false` mantém envios no endpoint Cloud API. Ative `true` somente após o onboarding específico da Marketing Messages API e testes em staging.

## Billing

Billing é configurado no WhatsApp Manager/Business Settings, não no código. Cadastre regras de preço vigentes na tabela `PricingRule`. Não codifique preço fixo. O custo confirmado depende das informações de pricing dos webhooks e da regra vigente cadastrada.
