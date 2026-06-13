import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getToken, setToken as setApiToken, getMe, type User } from '../lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getMe()
      .then(({ user: u }) => {
        if (!cancelled) {
          setUser(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiToken(null);
          setToken(null);
          setUser(null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  const login = useCallback((t: string, u: User) => {
    setApiToken(t);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    setApiToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
