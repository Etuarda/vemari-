import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CirclePlus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Modal } from '../components/Modal';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt?: string;
};

export function UsersPage() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['users'], queryFn: () => apiRequest<User[]>('/users') });
  const create = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      setOpen(false);
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>);
  }
  return (
    <>
      <header className="page-header">
        <div>
          <span>Controle de acesso</span>
          <h1>Usuários</h1>
          <p>Credenciais individuais, papéis explícitos e sessões revogáveis.</p>
        </div>
        <button className="primary-button" onClick={() => setOpen(true)}>
          <CirclePlus size={18} /> Novo usuário
        </button>
      </header>
      <section className="content-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papel</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <span className={`status status-${user.status.toLowerCase()}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString('pt-BR')
                      : 'Nunca'}
                  </td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() =>
                        update.mutate({
                          id: user.id,
                          status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                        })
                      }
                    >
                      {user.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal title="Novo usuário" open={open} onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Nome
            <input name="name" minLength={2} required />
          </label>
          <label>
            E-mail
            <input name="email" type="email" required />
          </label>
          <label>
            Papel
            <select name="role" required>
              <option value="ATTENDANT">Atendente</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="MARKETING_MANAGER">Gestor de marketing</option>
              <option value="READ_ONLY">Somente leitura</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>
          <label>
            Senha inicial
            <input name="password" type="password" minLength={8} required />
          </label>
          <div className="form-hint">
            Envie a senha por um canal seguro e solicite a troca no primeiro acesso.
          </div>
          {create.error && <div className="form-error">{create.error.message}</div>}
          <button className="primary-button" disabled={create.isPending}>
            Criar usuário
          </button>
        </form>
      </Modal>
    </>
  );
}
