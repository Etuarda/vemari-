# Checklist de homologação

Marque somente com evidência anexada.

## Segurança

- [ ] login de administrador válido;
- [ ] login de atendente válido;
- [ ] senha inválida gera auditoria e bloqueio após o limite;
- [ ] atendente recebe 403 em usuários, auditoria e campanhas;
- [ ] reset de senha revoga sessões;
- [ ] refresh token é rotacionado;
- [ ] endpoints privados rejeitam requisição sem token.

## Meta

- [ ] mensagem de teste retorna `wamid` real;
- [ ] template real é sincronizado;
- [ ] campanha aceita somente template aprovado de marketing;
- [ ] status enviado;
- [ ] status entregue;
- [ ] status lido;
- [ ] falha de envio com código da Meta;
- [ ] resposta do cliente aparece no inbox;
- [ ] webhook inválido retorna 401;
- [ ] webhook duplicado não duplica mensagem.

## Atendimento

- [ ] conversa sem atendente pode ser assumida;
- [ ] concorrência de atribuição retorna conflito;
- [ ] atendente não acessa conversa de outro atendente;
- [ ] supervisor transfere conversa;
- [ ] nota interna não é enviada ao cliente;
- [ ] janela de 24 horas fechada bloqueia texto livre;
- [ ] encerramento registra auditoria.

## Consentimento

- [ ] contato inicia como `UNKNOWN`;
- [ ] somente `OPTED_IN` entra em campanha;
- [ ] opt-out cria supressão;
- [ ] contato suprimido não recebe novo envio;
- [ ] remoção de supressão exige permissão administrativa.

## Operação

- [ ] migrations em banco limpo;
- [ ] backup e restore testados;
- [ ] readiness falha quando PostgreSQL ou Redis cai;
- [ ] dead-letter recebe job após esgotar tentativas;
- [ ] dashboards e alertas configurados;
- [ ] rollback ensaiado em staging;
- [ ] nenhuma credencial está no Git.
