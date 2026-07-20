import { useQuery } from '@tanstack/react-query';
import { CheckCheck, ContactRound, MessageSquareWarning, Send, UserRoundCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { StatCard } from '../components/StatCard';

type Summary = {
  contacts: number;
  optedIn: number;
  optedOut: number;
  activeCampaigns: number;
  waitingConversations: number;
  messages: { sent: number; delivered: number; read: number; failed: number };
};

export function DashboardPage() {
  const query = useQuery({ queryKey: ['summary'], queryFn: () => apiRequest<Summary>('/analytics/summary') });
  const data = query.data;
  return (
    <>
      <header className="page-header"><div><span>Operação</span><h1>Visão geral</h1><p>Acompanhe campanhas, consentimentos e a fila de atendimento.</p></div></header>
      {query.isLoading ? <div className="skeleton-grid" /> : query.error ? <div className="error-panel">{query.error.message}</div> : data && (
        <div className="stats-grid">
          <StatCard label="Contatos" value={data.contacts} helper={`${data.optedIn} com opt-in`} icon={<ContactRound />} />
          <StatCard label="Campanhas ativas" value={data.activeCampaigns} helper="Agendadas ou processando" icon={<Send />} />
          <StatCard label="Aguardando atendimento" value={data.waitingConversations} helper="Conversas sem responsável" icon={<MessageSquareWarning />} />
          <StatCard label="Mensagens entregues" value={data.messages.delivered + data.messages.read} helper={`${data.messages.read} lidas`} icon={<CheckCheck />} />
          <StatCard label="Opt-outs" value={data.optedOut} helper="Bloqueados para marketing" icon={<UserRoundCheck />} />
        </div>
      )}
      <section className="content-card operational-guide">
        <div><span className="eyebrow">Fluxo recomendado</span><h2>Antes de disparar uma campanha</h2></div>
        <ol><li>Confirme que os contatos possuem opt-in documentado.</li><li>Sincronize e valide o template aprovado pela Meta.</li><li>Revise público, variáveis, custo estimado e horário.</li><li>Acompanhe falhas e respostas na área de atendimento.</li></ol>
      </section>
    </>
  );
}
