import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Modal } from '../components/Modal';

type Template = { id: string; name: string; language: string; status: string; category: string };
type Campaign = { id: string; name: string; status: string; createdAt: string; template: Template; runs: Array<{ id: string; totalRecipients: number; submittedCount: number; deliveredCount: number; readCount: number; failedCount: number }> };

export function CampaignsPage() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => apiRequest<Campaign[]>('/campaigns') });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<Template[]>('/templates') });
  const create = useMutation({ mutationFn: (data: Record<string, unknown>) => apiRequest('/campaigns', { method: 'POST', body: JSON.stringify(data) }), onSuccess: () => { setOpen(false); void client.invalidateQueries({ queryKey: ['campaigns'] }); } });
  const action = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => apiRequest(`/campaigns/${id}/${action}`, { method: 'POST', headers: action === 'start' ? { 'Idempotency-Key': crypto.randomUUID() } : undefined }), onSuccess: () => client.invalidateQueries({ queryKey: ['campaigns'] }) });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bodyValues = String(form.get('bodyValues') ?? '').split('\n').map((v) => v.trim()).filter(Boolean);
    create.mutate({ name: form.get('name'), templateId: form.get('templateId'), templateParameters: bodyValues.length ? { body: bodyValues } : undefined });
  }

  return <><header className="page-header"><div><span>Disparos controlados</span><h1>Campanhas</h1><p>O envio usa snapshot de destinatários, idempotência e processamento por filas.</p></div><button className="primary-button" onClick={() => setOpen(true)}><CirclePlus size={18} /> Nova campanha</button></header>{action.error && <div className="error-panel">{action.error.message}</div>}<section className="content-card"><div className="table-wrap"><table><thead><tr><th>Campanha</th><th>Template</th><th>Status</th><th>Destinatários</th><th>Entregues</th><th>Lidas</th><th>Falhas</th><th>Ações</th></tr></thead><tbody>{campaigns.data?.map((campaign) => { const run = campaign.runs[0]; return <tr key={campaign.id}><td><strong>{campaign.name}</strong><small>{new Date(campaign.createdAt).toLocaleDateString('pt-BR')}</small></td><td>{campaign.template.name}<small>{campaign.template.language}</small></td><td><span className={`status status-${campaign.status.toLowerCase()}`}>{campaign.status}</span></td><td>{run?.totalRecipients ?? 0}</td><td>{run?.deliveredCount ?? 0}</td><td>{run?.readCount ?? 0}</td><td>{run?.failedCount ?? 0}</td><td><div className="inline-actions">{['DRAFT','SCHEDULED','FAILED'].includes(campaign.status) && <button title="Iniciar" className="icon-button" onClick={() => action.mutate({ id: campaign.id, action: 'start' })}><Play size={17} /></button>}{campaign.status === 'PROCESSING' && <button title="Pausar" className="icon-button" onClick={() => action.mutate({ id: campaign.id, action: 'pause' })}><Pause size={17} /></button>}{campaign.status === 'PAUSED' && <button title="Retomar" className="icon-button" onClick={() => action.mutate({ id: campaign.id, action: 'resume' })}><RotateCcw size={17} /></button>}{!['COMPLETED','CANCELED'].includes(campaign.status) && <button title="Cancelar" className="icon-button danger" onClick={() => action.mutate({ id: campaign.id, action: 'cancel' })}><XCircle size={17} /></button>}</div></td></tr>; })}{!campaigns.isLoading && !campaigns.data?.length && <tr><td colSpan={8} className="empty-cell">Nenhuma campanha criada.</td></tr>}</tbody></table></div></section><Modal title="Nova campanha" open={open} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={submit}><label>Nome<input name="name" minLength={3} required /></label><label>Template<select name="templateId" required><option value="">Selecione</option>{templates.data?.filter((t) => t.status === 'APPROVED' && t.category === 'MARKETING').map((t) => <option key={t.id} value={t.id}>{t.name} — {t.language}</option>)}</select></label><label className="full-width">Variáveis do corpo<textarea name="bodyValues" rows={4} placeholder={'Uma variável por linha. Use {{contact.name}}, {{contact.phone}} ou {{contact.email}}.'} /></label><div className="form-hint">A campanha será criada como rascunho. Antes do envio, a API valida template, categoria, consentimentos e supressões.</div>{create.error && <div className="form-error">{create.error.message}</div>}<button className="primary-button" disabled={create.isPending}>Criar rascunho</button></form></Modal></>;
}
