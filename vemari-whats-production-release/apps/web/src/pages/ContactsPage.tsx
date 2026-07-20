import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Modal } from '../components/Modal';

type Contact = {
  id: string;
  name: string;
  phoneE164: string;
  email?: string;
  marketingStatus: 'UNKNOWN' | 'OPTED_IN' | 'OPTED_OUT' | 'BLOCKED';
  source?: string;
  suppressions: Array<{ id: string; reason: string }>;
};

export function ContactsPage() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [consentContact, setConsentContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['contacts', search], queryFn: () => apiRequest<Contact[]>(`/contacts?search=${encodeURIComponent(search)}`) });
  const create = useMutation({
    mutationFn: (data: Record<string, string>) => apiRequest('/contacts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { setOpen(false); void client.invalidateQueries({ queryKey: ['contacts'] }); },
  });
  const consent = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) => apiRequest(`/contacts/${id}/consents`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { setConsentContact(null); void client.invalidateQueries({ queryKey: ['contacts'] }); },
  });

  function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    create.mutate(data);
  }

  function registerConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consentContact) return;
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    consent.mutate({ id: consentContact.id, data });
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    await apiRequest('/contacts/import', { method: 'POST', body });
    await client.invalidateQueries({ queryKey: ['contacts'] });
    event.target.value = '';
  }

  return (
    <>
      <header className="page-header"><div><span>Base de público</span><h1>Contatos</h1><p>Cadastro não significa consentimento. O estado inicial é sempre desconhecido.</p></div><div className="page-actions"><label className="secondary-button file-button"><Upload size={18} /> Importar CSV<input type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e)} /></label><button className="primary-button" onClick={() => setOpen(true)}><CirclePlus size={18} /> Novo contato</button></div></header>
      <section className="content-card">
        <div className="table-toolbar"><input aria-label="Buscar contatos" placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="table-wrap"><table><thead><tr><th>Contato</th><th>Telefone</th><th>Origem</th><th>Consentimento</th><th>Ação</th></tr></thead><tbody>
          {query.data?.map((contact) => <tr key={contact.id}><td><strong>{contact.name}</strong><small>{contact.email ?? 'Sem e-mail'}</small></td><td>{contact.phoneE164}</td><td>{contact.source ?? 'Não informada'}</td><td><span className={`status status-${contact.marketingStatus.toLowerCase()}`}>{contact.marketingStatus}</span>{contact.suppressions.length > 0 && <small>Suprimido</small>}</td><td><button className="link-button" onClick={() => setConsentContact(contact)}>Registrar consentimento</button></td></tr>)}
          {!query.isLoading && !query.data?.length && <tr><td colSpan={5} className="empty-cell">Nenhum contato cadastrado.</td></tr>}
        </tbody></table></div>
      </section>

      <Modal title="Novo contato" open={open} onClose={() => setOpen(false)}><form className="form-grid" onSubmit={createContact}><label>Nome<input name="name" required minLength={2} /></label><label>Telefone<input name="phone" required placeholder="(89) 99999-9999" /></label><label>E-mail<input name="email" type="email" /></label><label>Origem<input name="source" placeholder="Site, evento, indicação…" /></label><div className="form-hint">O contato será criado com status <strong>UNKNOWN</strong>.</div>{create.error && <div className="form-error">{create.error.message}</div>}<button className="primary-button" disabled={create.isPending}>Cadastrar</button></form></Modal>
      <Modal title={`Consentimento — ${consentContact?.name ?? ''}`} open={Boolean(consentContact)} onClose={() => setConsentContact(null)}><form className="form-grid" onSubmit={registerConsent}><label>Status<select name="status" required><option value="OPTED_IN">OPTED_IN</option><option value="OPTED_OUT">OPTED_OUT</option><option value="BLOCKED">BLOCKED</option><option value="UNKNOWN">UNKNOWN</option></select></label><label>Finalidade<input name="purpose" defaultValue="Marketing via WhatsApp" required /></label><label>Canal<input name="channel" defaultValue="WHATSAPP" required /></label><label>Origem da evidência<input name="source" placeholder="Formulário, contrato, solicitação…" required /></label><label className="full-width">Evidência<textarea name="evidence" rows={4} placeholder="Descreva onde e como o consentimento foi obtido." /></label><label>Versão do termo<input name="termVersion" placeholder="2026-01" /></label>{consent.error && <div className="form-error">{consent.error.message}</div>}<button className="primary-button" disabled={consent.isPending}>Registrar</button></form></Modal>
    </>
  );
}
