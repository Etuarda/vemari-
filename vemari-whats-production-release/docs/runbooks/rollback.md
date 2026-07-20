# Runbook de rollback

## Aplicação

1. pause campanhas;
2. mantenha webhooks recebendo e persistindo;
3. reverta API e worker para a tag anterior;
4. valide health checks;
5. reprocessse jobs idempotentes;
6. libere campanhas somente após estabilização.

## Banco

Migrations devem ser backward-compatible. Não reverta banco automaticamente. Para corrupção ou migration destrutiva, interrompa escrita, preserve evidências e restaure o backup validado conforme `restore-postgres.sh`.
