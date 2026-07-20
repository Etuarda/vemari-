import { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Send } from 'lucide-react';
import { apiRequest } from '../lib/api';

type Status = { configured: boolean; connected: boolean; reason?: string; graphApiVersion?: string; useMarketingMessagesApi?: boolean; phone?: any };

export function SettingsPage() {
  const status = useQuery({ queryKey: ['meta-status'], queryFn: () => apiRequest<Status>('/whatsapp/status'), retry: false });
  const test = useMutation({ mutationFn: (data: Record<string, string>) => apiRequest('/whatsapp/test-message', { method: 'POST', body: JSON.stringify(data) }) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); test.mutate(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>); }
  const data = status.data;
  return <><header className="page-header"><div><span>Configuração operacional</span><h1>Integração Meta</h1><p>Credenciais ficam no secret manager do ambiente e nunca são enviadas ao navegador.</p></div></header><div className="settings-grid"><section className="content-card"><div className="integration-status">{data?.connected ? <CheckCircle2 className="success-icon" /> : <CircleAlert className="warning-icon" />}<div><span>Status</span><h2>{data?.connected ? 'Conectada' : 'Não configurada'}</h2><p>{data?.reason ?? `Graph API ${data?.graphApiVersion ?? ''}`}</p></div></div>{data?.phone && <pre className="safe-json">{JSON.stringify(data.phone, null, 2)}</pre>}</section><section className="content-card"><span className="eyebrow">Homologação</span><h2>Enviar template de teste</h2><p>Use apenas o número de teste ou um destinatário autorizado durante a homologação.</p><form className="form-grid compact" onSubmit={submit}><label>Número E.164<input name="to" placeholder="+5589999999999" required /></label><label>Template<input name="templateName" defaultValue="hello_world" required /></label><label>Idioma<input name="languageCode" defaultValue="en_US" required /></label>{test.error && <div className="form-error">{test.error.message}</div>}{test.isSuccess && <div className="success-panel">Solicitação aceita pela Meta.</div>}<button className="primary-button" disabled={test.isPending || !data?.configured}><Send size={18} /> Enviar teste</button></form></section></div></>;
}
