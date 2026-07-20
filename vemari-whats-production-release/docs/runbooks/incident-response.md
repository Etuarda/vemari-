# Política de incidentes

## Severidade

- SEV1: vazamento, envio indevido em massa, indisponibilidade total ou credencial Meta comprometida;
- SEV2: falha parcial de envio, inbox indisponível ou fila acumulando;
- SEV3: defeito sem impacto crítico.

## Resposta

1. identificar e registrar horário;
2. pausar campanhas quando houver risco de envio;
3. revogar tokens e sessões comprometidas;
4. preservar logs, webhooks e auditoria;
5. conter o incidente;
6. comunicar responsáveis internos;
7. restaurar serviço com mudança mínima;
8. produzir análise de causa raiz e ações preventivas.

Nunca apague registros para “corrigir” um incidente. Use eventos compensatórios e preserve a trilha de auditoria.
