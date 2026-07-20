import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, Send, StickyNote, UserCheck, XCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth/AuthProvider';
import { apiRequest, getAccessToken } from '../lib/api';

type Conversation = {
  id: string;
  status: string;
  version: number;
  unreadCount: number;
  lastMessageAt?: string;
  lastInboundAt?: string;
  assignedUserId?: string;
  contact: { id: string; name: string; phoneE164: string; marketingStatus: string };
  assignedUser?: { id: string; name: string; email: string };
  messages: Array<{ id: string; content?: string; createdAt: string }>;
};
type Message = { id: string; direction: string; type: string; status: string; content?: string; createdAt: string; sender?: { name: string } };
type Attendant = { id: string; name: string; email: string; role: string };

export function InboxPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => apiRequest<Conversation[]>('/conversations') });
  const attendants = useQuery({ queryKey: ['attendants'], queryFn: () => apiRequest<Attendant[]>('/users/attendants') });
  const selected = conversations.data?.find((item) => item.id === selectedId) ?? conversations.data?.[0] ?? null;
  const messages = useQuery({ queryKey: ['messages', selected?.id], enabled: Boolean(selected), queryFn: () => apiRequest<Message[]>(`/conversations/${selected!.id}/messages`) });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = io('/realtime', { auth: { token }, transports: ['websocket'] });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) void client.invalidateQueries({ queryKey: ['messages', selected.id] });
    };
    ['message.received','message.created','message.status.updated','conversation.updated','conversation.assigned','conversation.closed'].forEach((event) => socket.on(event, refresh));
    return () => { socket.disconnect(); };
  }, [client, selected?.id]);

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => apiRequest(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) void client.invalidateQueries({ queryKey: ['messages', selected.id] });
    },
  });

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const content = String(new FormData(form).get('content') ?? '').trim();
    if (!content) return;
    action.mutate({ path: `/conversations/${selected.id}/${noteMode ? 'internal-notes' : 'messages'}`, body: { content } });
    form.reset();
  }

  const orderedMessages = useMemo(() => [...(messages.data ?? [])].reverse(), [messages.data]);

  return (
    <>
      <header className="page-header compact-header"><div><span>Atendimento humano</span><h1>Caixa de entrada</h1><p>Assuma, transfira e responda dentro da janela de atendimento.</p></div></header>
      <section className="inbox-layout">
        <aside className="conversation-list" aria-label="Conversas">
          <div className="conversation-list-header"><h2>Conversas</h2><span>{conversations.data?.length ?? 0}</span></div>
          {conversations.data?.map((conversation) => (
            <button key={conversation.id} className={`conversation-item ${selected?.id === conversation.id ? 'active' : ''}`} onClick={() => setSelectedId(conversation.id)}>
              <span className="avatar">{conversation.contact.name.slice(0, 1).toUpperCase()}</span>
              <span className="conversation-copy"><strong>{conversation.contact.name}</strong><small>{conversation.messages[0]?.content ?? 'Sem prévia disponível'}</small></span>
              <span className="conversation-meta"><small>{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</small>{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span>
            </button>
          ))}
          {!conversations.isLoading && !conversations.data?.length && <div className="empty-inbox"><MessageSquarePlus size={28} /><p>Nenhuma conversa recebida.</p></div>}
        </aside>
        <div className="chat-panel">
          {selected ? <>
            <header className="chat-header"><div><strong>{selected.contact.name}</strong><span>{selected.contact.phoneE164} · {selected.status}</span></div><div className="inline-actions"><select aria-label="Atribuir conversa" value={selected.assignedUserId ?? ''} onChange={(e) => action.mutate({ path: `/conversations/${selected.id}/assign`, body: { userId: e.target.value, version: selected.version, note: 'Atribuição realizada pelo dashboard' } })}><option value="">Sem atendente</option>{attendants.data?.map((attendant) => <option key={attendant.id} value={attendant.id}>{attendant.name}</option>)}</select>{!selected.assignedUserId && user && <button className="secondary-button" onClick={() => action.mutate({ path: `/conversations/${selected.id}/assign`, body: { userId: user.id, version: selected.version, note: 'Atendimento assumido' } })}><UserCheck size={17} /> Assumir</button>}<button className="icon-button danger" title="Encerrar" onClick={() => action.mutate({ path: `/conversations/${selected.id}/close` })}><XCircle size={18} /></button></div></header>
            <div className="message-stream" aria-live="polite">{orderedMessages.map((message) => <article key={message.id} className={`message-bubble message-${message.direction.toLowerCase()} ${message.type === 'INTERNAL_NOTE' ? 'message-note' : ''}`}><div>{message.type === 'INTERNAL_NOTE' && <small>Nota interna · {message.sender?.name}</small>}<p>{message.content ?? `[${message.type}]`}</p><footer>{new Date(message.createdAt).toLocaleString('pt-BR')} · {message.status}</footer></div></article>)}{!messages.isLoading && !orderedMessages.length && <div className="empty-inbox"><p>Sem mensagens nesta conversa.</p></div>}</div>
            <form className={`composer ${noteMode ? 'composer-note' : ''}`} onSubmit={submitMessage}><div className="composer-mode"><button type="button" className={!noteMode ? 'active' : ''} onClick={() => setNoteMode(false)}><Send size={16} /> Resposta</button><button type="button" className={noteMode ? 'active' : ''} onClick={() => setNoteMode(true)}><StickyNote size={16} /> Nota interna</button></div><div className="composer-row"><textarea name="content" rows={2} placeholder={noteMode ? 'Escreva uma nota visível apenas para a equipe…' : 'Escreva uma resposta…'} required /><button className="primary-button" disabled={action.isPending}><Send size={18} aria-hidden="true" /><span className="sr-only">Enviar</span></button></div>{action.error && <div className="form-error">{action.error.message}</div>}</form>
          </> : <div className="empty-inbox large"><MessageSquarePlus size={36} /><h2>Selecione uma conversa</h2><p>As respostas recebidas pelo webhook aparecerão aqui.</p></div>}
        </div>
        <aside className="contact-panel">{selected && <><span className="avatar large-avatar">{selected.contact.name.slice(0, 1).toUpperCase()}</span><h2>{selected.contact.name}</h2><p>{selected.contact.phoneE164}</p><dl><div><dt>Consentimento</dt><dd>{selected.contact.marketingStatus}</dd></div><div><dt>Responsável</dt><dd>{selected.assignedUser?.name ?? 'Não atribuído'}</dd></div><div><dt>Status</dt><dd>{selected.status}</dd></div><div><dt>Última entrada</dt><dd>{selected.lastInboundAt ? new Date(selected.lastInboundAt).toLocaleString('pt-BR') : 'Não registrada'}</dd></div></dl></>}</aside>
      </section>
    </>
  );
}
