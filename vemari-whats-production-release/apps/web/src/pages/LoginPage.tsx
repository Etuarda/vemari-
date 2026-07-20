import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole, MessageCircleMore } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { registerRequest } from '../lib/api';

type AuthMode = 'login' | 'register';

export function LoginPage() {
  const { user, login } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmation('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'register' && password !== confirmation) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        return;
      }

      await registerRequest(name, email, password);
      setSuccess('Cadastro criado. Agora você já pode entrar com seu e-mail e senha.');
      setMode('login');
      setName('');
      setPassword('');
      setConfirmation('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-logo"><MessageCircleMore size={28} /><span>Vemari Whats</span></div>
        <h1>Campanhas e atendimento em um ambiente seguro.</h1>
        <p>Contas possuem acesso individual, rastreável e administrado pelos papéis técnicos da plataforma.</p>
        <div className="security-note"><LockKeyhole size={20} /><span>Não compartilhe sua credencial. O acesso é individual e auditável.</span></div>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="auth-tabs" role="tablist" aria-label="Acesso à plataforma">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Entrar</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Criar cadastro</button>
          </div>
          <header>
            <span>{mode === 'login' ? 'Acesso interno' : 'Novo acesso'}</span>
            <h2>{mode === 'login' ? 'Entre na plataforma' : 'Crie seu cadastro'}</h2>
            <p>{mode === 'login' ? 'Use seu e-mail e senha.' : 'O administrador poderá ajustar seu papel após o cadastro.'}</p>
          </header>
          {mode === 'register' && <label>Nome completo<input type="text" autoComplete="name" minLength={2} value={name} onChange={(event) => setName(event.target.value)} required /></label>}
          <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {mode === 'register' && <label>Confirmar senha<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>}
          {mode === 'register' && <div className="form-hint">A senha deve possuir pelo menos 8 caracteres. Novos cadastros recebem acesso somente leitura até revisão do administrador.</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          {success && <div className="success-panel" role="status">{success}</div>}
          <button className="primary-button" disabled={submitting}>{submitting ? 'Processando…' : mode === 'login' ? 'Entrar' : 'Criar cadastro'}</button>
        </form>
      </section>
    </main>
  );
}
