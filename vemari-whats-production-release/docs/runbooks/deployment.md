# Runbook de deploy

1. Execute CI e homologação em staging.
2. Gere backup e valide checksum.
3. Registre a tag da imagem aprovada.
4. Execute `docker compose pull` ou build imutável.
5. Execute migrations antes da API.
6. Suba API e workers.
7. Valide readiness, login e envio interno.
8. Suba o proxy/web.
9. Monitore erros, fila e webhooks por pelo menos um ciclo operacional.

Nunca faça migration destrutiva e deploy de código incompatível na mesma etapa sem estratégia expand/contract.
