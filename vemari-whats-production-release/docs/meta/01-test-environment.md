# Meta — ambiente de teste

Estas ações exigem acesso ao Meta for Developers e não podem ser executadas apenas pelo código.

## 1. Aplicativo

1. Crie ou selecione um Business Portfolio da Vemari.
2. Crie um aplicativo do tipo empresarial.
3. Adicione o produto WhatsApp.
4. No painel de API Setup, anote o WABA ID e Phone Number ID de teste.
5. Adicione os números destinatários permitidos no ambiente de teste.

## 2. Variáveis

Preencha `META_APP_ID`, `META_APP_SECRET`, `META_WABA_ID`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN` e `META_WEBHOOK_VERIFY_TOKEN`.

## 3. Webhook

URL pública:

```text
https://SEU_DOMINIO/api/v1/webhooks/whatsapp
```

Informe o mesmo verify token do ambiente. Assine o campo `messages`. Depois execute:

```bash
set -a; . ./.env; set +a
./infra/scripts/meta-subscribe-waba.sh
```

## 4. Mensagem de teste

Entre como administrador e use Configurações > Mensagem de teste, ou chame `POST /api/v1/whatsapp/test-message`. O template padrão de teste é `hello_world` pela Cloud API.

## 5. Evidências

Confirme no banco e na interface:

- `metaMessageId` real;
- webhook armazenado com assinatura válida;
- transições `SUBMITTED`, `SENT`, `DELIVERED`, `READ`;
- evento `FAILED` com código real em teste negativo;
- resposta do cliente criando contato, conversa e mensagem;
- duplicidade de webhook não duplicando dados.
