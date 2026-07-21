import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus, Copy, Link2, LockKeyhole, ShieldOff } from 'lucide-react';
import { hasPermission, Permission, Role } from '@vemari/contracts';
import { apiRequest } from '../lib/api';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/AuthProvider';

type InvitationSummary = {
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  lastLoginAt?: string;
  invitations: InvitationSummary[];
};

type InvitationResult = {
  activationUrl?: string;
  resetUrl?: string;
  expiresAt: string;
};

type CreateResult = { user: User; invitation: InvitationResult };

const roleLabels: Record<Role, string> = {
  ADMIN: 'Administrador',
  MARKETING_MANAGER: 'Marketing',
  SUPERVISOR: 'Supervisor',
  ATTENDANT: 'Atendente',
  READ_ONLY: 'Somente leitura',
};

const statusLabels: Record<User['status'], string> = {
  INVITED: 'Convite pendente',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  REMOVED: 'Removido',
};

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const canManage = Boolean(currentUser && hasPermission(currentUser.role, Permission.USER_MANAGE));
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [linkResult, setLinkResult] = useState<InvitationResult | null>(null);
  const [createdUser, setCreatedUser] = useState<Pick<User, 'name' | 'email' | 'role'> | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const query = useQuery({ queryKey: ['users'], queryFn: () => apiRequest<User[]>('/users') });

  const create = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest<CreateResult>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      setCreatedUser(result.user);
      setLinkResult(result.invitation);
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const action = useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      apiRequest<InvitationResult | { success: true }>(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: (result) => {
      if ('activationUrl' in result || 'resetUrl' in result) {
        setLinkResult(result);
        setOpen(true);
      }
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>);
  }

  async function copyLink() {
    const link = linkResult?.activationUrl ?? linkResult?.resetUrl;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  function closeModal() {
    setOpen(false);
    setLinkResult(null);
    setCreatedUser(null);
    setCopied(false);
    create.reset();
  }

  return (
    <>
      <header className="page-header">
        <div>
          <span>Controle de acesso</span>
          <h1>Usuários</h1>
          <p>Convites de uso único: cada pessoa cria a própria senha.</p>
        </div>
        {canManage && (
          <button className="primary-button" onClick={() => setOpen(true)}>
            <CirclePlus size={18} /> Convidar usuário
          </button>
        )}
      </header>
      {(query.error || action.error) && (
        <div className="error-panel">{query.error?.message ?? action.error?.message}</div>
      )}
      <section className="content-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papel</th>
                <th>Status</th>
                <th>Convite</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((user) => {
                const invitation = user.invitations[0];
                const pending = invitation && !invitation.usedAt && !invitation.revokedAt;
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      {canManage ? (
                        <select
                          value={user.role}
                          aria-label={`Papel de ${user.name}`}
                          onChange={(event) =>
                            action.mutate({
                              path: `/users/${user.id}`,
                              method: 'PATCH',
                              body: { role: event.target.value },
                            })
                          }
                        >
                          {Object.entries(roleLabels).map(([role, label]) => (
                            <option key={role} value={role}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleLabels[user.role]
                      )}
                    </td>
                    <td>
                      <span className={`status status-${user.status.toLowerCase()}`}>
                        {statusLabels[user.status]}
                      </span>
                    </td>
                    <td>
                      {pending
                        ? `Expira ${new Date(invitation.expiresAt).toLocaleString('pt-BR')}`
                        : invitation?.usedAt
                          ? 'Utilizado'
                          : '—'}
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString('pt-BR')
                        : 'Nunca'}
                    </td>
                    <td>
                      {canManage && (
                        <div className="inline-actions">
                          {user.status === 'INVITED' && (
                            <>
                              <button
                                className="icon-button"
                                title="Gerar novo convite"
                                onClick={() =>
                                  action.mutate({ path: `/users/${user.id}/invitations` })
                                }
                              >
                                <Link2 size={16} />
                              </button>
                              <button
                                className="icon-button danger"
                                title="Revogar convite"
                                onClick={() =>
                                  action.mutate({
                                    path: `/users/${user.id}/invitations`,
                                    method: 'DELETE',
                                  })
                                }
                              >
                                <ShieldOff size={16} />
                              </button>
                            </>
                          )}
                          {user.status === 'ACTIVE' && (
                            <>
                              <button
                                className="icon-button"
                                title="Gerar link para redefinir senha"
                                onClick={() =>
                                  action.mutate({
                                    path: `/users/${user.id}/password-reset-invitations`,
                                  })
                                }
                              >
                                <LockKeyhole size={16} />
                              </button>
                              <button
                                className="link-button"
                                onClick={() =>
                                  action.mutate({ path: `/users/${user.id}/revoke-sessions` })
                                }
                              >
                                Encerrar sessões
                              </button>
                              <button
                                className="link-button"
                                onClick={() =>
                                  action.mutate({
                                    path: `/users/${user.id}`,
                                    method: 'PATCH',
                                    body: { status: 'SUSPENDED' },
                                  })
                                }
                              >
                                Suspender
                              </button>
                            </>
                          )}
                          {user.status === 'SUSPENDED' && (
                            <button
                              className="link-button"
                              onClick={() =>
                                action.mutate({
                                  path: `/users/${user.id}`,
                                  method: 'PATCH',
                                  body: { status: 'ACTIVE' },
                                })
                              }
                            >
                              Reativar
                            </button>
                          )}
                          {currentUser?.id !== user.id && (
                            <button
                              className="link-button danger"
                              onClick={() =>
                                action.mutate({
                                  path: `/users/${user.id}`,
                                  method: 'PATCH',
                                  body: { status: 'REMOVED' },
                                })
                              }
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!query.isLoading && !query.data?.length && (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        title={linkResult ? 'Link de acesso' : 'Convidar usuário'}
        open={open}
        onClose={closeModal}
      >
        {linkResult ? (
          <div className="invitation-result">
            <div className="success-panel">
              <strong>{createdUser ? 'Usuário criado' : 'Novo link gerado'}</strong>
            </div>
            {createdUser && (
              <div>
                <strong>{createdUser.name}</strong>
                <small>
                  {createdUser.email} · {roleLabels[createdUser.role]}
                </small>
              </div>
            )}
            <p>Este link permite criar uma senha e será exibido somente agora.</p>
            <div className="invitation-link">{linkResult.activationUrl ?? linkResult.resetUrl}</div>
            <button className="primary-button" type="button" onClick={() => void copyLink()}>
              <Copy size={17} /> {copied ? 'Link copiado' : 'Copiar link'}
            </button>
            <div className="form-hint">
              Validade: {new Date(linkResult.expiresAt).toLocaleString('pt-BR')}. Uso único. Um novo
              link revoga o anterior.
            </div>
          </div>
        ) : (
          <form className="form-grid" onSubmit={submit}>
            <label>
              Nome completo
              <input name="name" minLength={2} required />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label className="full-width">
              Papel
              <select name="role" required>
                <option value="ATTENDANT">Atendente</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="MARKETING_MANAGER">Marketing</option>
                <option value="READ_ONLY">Somente leitura</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <div className="form-hint">
              A pessoa receberá um link para criar a própria senha. Nenhuma senha será definida pelo
              administrador.
            </div>
            {create.error && <div className="form-error">{create.error.message}</div>}
            <button className="primary-button" disabled={create.isPending}>
              Criar convite
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
