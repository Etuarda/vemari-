import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, AppUser, loginRequest, setAccessToken } from '../lib/api';

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<{ accessToken: string; user: AppUser }>('/auth/refresh', { method: 'POST' }, false)
      .then((result) => {
        setAccessToken(result.accessToken);
        setUser(result.user);
      })
      .catch(() => {
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await loginRequest(email, password);
      setAccessToken(result.accessToken);
      setUser(result.user);
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
      setAccessToken(null);
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}
