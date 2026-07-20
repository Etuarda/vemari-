import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiRequest, downloadAuditCsv } from '../lib/api';

type AuditLog = { id: string; createdAt: string; actorEmail?: string; actorRole?: string; action: string; resourceType: string; resourceId?: string; result: string; reason?: string; ipAddress?: string };

export function AuditPage() {
  const query = useQuery({ queryKey: ['audit'], queryFn: () => apiRequest<AuditLog[]>('/audit-logs?take=200') });
  return <><header className="page-header"><div><span>Rastreabilidade</span><h1>Auditoria</h1><p>Registros append-only protegidos contra alteração e exclusão no PostgreSQL.</p></div><button className="secondary-button" onClick={() => void downloadAuditCsv()}><Download size={18} /> Exportar CSV</button></header><section className="content-card"><div className="table-wrap"><table><thead><tr><th>Data</th><th>Ator</th><th>Ação</th><th>Recurso</th><th>Resultado</th><th>Origem</th></tr></thead><tbody>{query.data?.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td><td><strong>{log.actorEmail ?? 'Sistema'}</strong><small>{log.actorRole ?? 'SYSTEM'}</small></td><td>{log.action}<small>{log.reason}</small></td><td>{log.resourceType}<small>{log.resourceId}</small></td><td><span className={`status status-${log.result.toLowerCase()}`}>{log.result}</span></td><td>{log.ipAddress ?? 'Interno'}</td></tr>)}</tbody></table></div></section></>;
}
