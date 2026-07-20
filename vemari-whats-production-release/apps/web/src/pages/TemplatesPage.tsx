import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api';

type Template = { id: string; name: string; language: string; category: string; status: string; lastSyncedAt: string };

export function TemplatesPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<Template[]>('/templates') });
  const sync = useMutation({ mutationFn: () => apiRequest('/templates/sync', { method: 'POST' }), onSuccess: () => client.invalidateQueries({ queryKey: ['templates'] }) });
  return <><header className="page-header"><div><span>WhatsApp Manager</span><h1>Templates</h1><p>Somente templates aprovados e sincronizados podem ser usados nas campanhas.</p></div><button className="primary-button" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw size={18} /> {sync.isPending ? 'Sincronizando…' : 'Sincronizar com a Meta'}</button></header>{sync.error && <div className="error-panel">{sync.error.message}</div>}<section className="content-card"><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Idioma</th><th>Categoria</th><th>Status</th><th>Última sincronização</th></tr></thead><tbody>{query.data?.map((template) => <tr key={template.id}><td><strong>{template.name}</strong></td><td>{template.language}</td><td>{template.category}</td><td><span className={`status status-${template.status.toLowerCase()}`}>{template.status}</span></td><td>{new Date(template.lastSyncedAt).toLocaleString('pt-BR')}</td></tr>)}{!query.isLoading && !query.data?.length && <tr><td colSpan={5} className="empty-cell">Nenhum template sincronizado. Configure a integração Meta e execute a sincronização.</td></tr>}</tbody></table></div></section></>;
}
