# Meta — número real

## Pré-requisitos

- Business Portfolio com dados empresariais corretos;
- administradores com 2FA;
- WABA da Vemari;
- número decidido: novo, migrado ou coexistente;
- nome de exibição aprovado;
- método de pagamento configurado.

## Registro

1. Adicione e verifique o número no WhatsApp Manager.
2. Defina o PIN de seis dígitos de verificação em duas etapas.
3. Crie um System User no Business Settings.
4. Conceda acesso ao app e aos ativos do WhatsApp.
5. Gere token com `whatsapp_business_messaging` e `whatsapp_business_management`.
6. Armazene o token em secret manager.
7. Para registrar via API, defina temporariamente `META_REGISTRATION_PIN` e execute:

```bash
set -a; . ./.env; set +a
./infra/scripts/meta-register-phone.sh
unset META_REGISTRATION_PIN
```

Não coloque o PIN no repositório ou em logs.

## Corte controlado

- pause campanhas;
- faça backup;
- configure o número;
- envie apenas para equipe interna;
- valide envio, entrega, leitura, falha e resposta;
- só depois libere um lote pequeno de contatos autorizados.
