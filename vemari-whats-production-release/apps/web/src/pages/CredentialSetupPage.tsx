import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LockKeyhole, MessageCircleMore } from 'lucide-react';
import { apiRequest } from '../lib/api';

type Mode = 'activation' | 'reset';
type Validation = {
  valid: boolean;
  user?: { name: string; email: string; role: string };
  expiresAt?: string;
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  MARKETING_MANAGER: 'Marketing',
  SUPERVISOR: 'Supervisor',
  ATTENDANT: 'Atendente',
  READ_ONLY: 'Somente leitura',
};

export function CredentialSetupPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [validation, setValidation] = useState<Validation | null>(token ? null : { valid: false });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    const path =
      mode === 'activation'
        ? '/auth/invitations/validate'
        : '/auth/password-reset-invitations/validate';
    apiRequest<Validation>(`${path}?token=${encodeURIComponent(token)}`, {}, false)
      .then(setValidation)
      .catch(() => setValidation({ valid: false }));
  }, [mode, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest(
        mode === 'activation' ? '/auth/activate' : '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ token, password, passwordConfirmation: confirmation }),
        },
        false,
      );
      setSuccess(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível utilizar o link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="credential-page">
      <section className="credential-card">
        <div className="login-logo">
          <MessageCircleMore size={28} />
          <span>Vemari Whats</span>
        </div>
        {!validation && <p>Validando o link seguro…</p>}
        {validation && !validation.valid && (
          <>
            <h1>Link indisponível</h1>
            <p>Este link é inválido, expirou, foi revogado ou já foi utilizado.</p>
            <Link className="primary-button" to="/login">
              Ir para o login
            </Link>
          </>
        )}
        {validation?.valid && !success && (
          <>
            <span className="eyebrow">Acesso seguro</span>
            <h1>{mode === 'activation' ? 'Ative sua conta' : 'Crie uma nova senha'}</h1>
            <div className="credential-user">
              <strong>{validation.user?.name}</strong>
              <span>{validation.user?.email}</span>
              <small>Perfil: {roleLabels[validation.user?.role ?? '']}</small>
            </div>
            <form className="form-grid compact" onSubmit={submit}>
              <label>
                Nova senha
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <label>
                Confirmar senha
                <input
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </label>
              <div className="form-hint">
                <LockKeyhole size={15} /> Mínimo de 8 caracteres. O link deixará de funcionar após a
                confirmação.
              </div>
              {error && <div className="form-error">{error}</div>}
              <button className="primary-button" disabled={submitting}>
                {submitting
                  ? 'Salvando…'
                  : mode === 'activation'
                    ? 'Ativar conta'
                    : 'Redefinir senha'}
              </button>
            </form>
          </>
        )}
        {success && (
          <>
            <div className="success-panel">
              <strong>{mode === 'activation' ? 'Conta ativada' : 'Senha redefinida'}</strong>
            </div>
            <p>Sua senha foi criada com segurança. O link não pode mais ser utilizado.</p>
            <Link className="primary-button" to="/login">
              Entrar na plataforma
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
