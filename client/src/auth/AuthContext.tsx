import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, setUnauthorizedHandler } from '../api/client.js';

interface User { id: string; name: string; email: string; role: string; }
interface AuthValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const STORAGE_KEY = 'matchday.auth';

function readStored(): { token: string; user: User } | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStored()?.token ?? null);
  const [user, setUser] = useState<User | null>(() => readStored()?.user ?? null);

  const logout = useCallback(() => {
    setToken(null); setUser(null); localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: { email, password },
    });
    setToken(res.token); setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  }, []);

  const value = useMemo(() => ({ user, token, login, logout }), [user, token, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
