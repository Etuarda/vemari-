import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole, MessageCircleMore } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha no acesso.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-logo">
          <MessageCircleMore size={28} />
          <span>Vemari Whats</span>
        </div>
        <h1>Campanhas e atendimento em um ambiente seguro.</h1>
        <p>
          O acesso é criado e administrado internamente. Solicite suas credenciais ao administrador.
        </p>
        <div className="security-note">
          <LockKeyhole size={20} />
          <span>Não compartilhe sua credencial. O acesso é individual e auditável.</span>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <header>
            <span>Acesso interno</span>
            <h2>Entre na plataforma</h2>
            <p>Use o e-mail e a senha fornecidos pelo administrador.</p>
          </header>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary-button" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
