# Auditoria

## Cobertura

- login bem-sucedido e falho;
- acesso negado por RBAC;
- criação e alteração de usuários;
- reset de senha;
- contatos, consentimentos e supressões;
- importações;
- templates e mensagens de teste;
- criação, início, pausa, retomada e cancelamento de campanhas;
- atribuição, transferência, resposta, nota e encerramento;
- exportação da auditoria;
- falhas de mutações HTTP autenticadas.

## Imutabilidade

A migration cria triggers que rejeitam `UPDATE` e `DELETE` na tabela `AuditLog`. A aplicação somente insere e consulta. O log possui retenção configurável por `AUDIT_RETENTION_DAYS`.

## Exportação

Somente `AUDIT_EXPORT` pode baixar CSV. A própria exportação gera evento de auditoria. Tokens, senhas e segredos são removidos pelo sanitizador.

## Limitação

Imutabilidade no banco não substitui backup externo e controle de acesso à infraestrutura. Em produção, exporte backups criptografados para storage separado e limite o acesso administrativo ao PostgreSQL.
