import * as React from 'react';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContext as AuthContextType } from '../types';
import { getToken, clearToken } from '../api/auth';

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthState {
  isAuthenticated: boolean;
  authContext: AuthContextType | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function parseJWT(token: string): AuthContextType | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return {
      userId: payload.userId,
      email: payload.email
    };
  } catch (error) {
    console.error('Failed to parse JWT:', error);
    return null;
  }
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authContext, setAuthContext] = useState<AuthContextType | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      const parsed = parseJWT(token);
      if (parsed) {
        setAuthContext(parsed);
        setIsAuthenticated(true);
      } else {
        clearToken();
      }
    }
  }, []);

  const login = (token: string) => {
    const parsed = parseJWT(token);
    if (parsed) {
      setAuthContext(parsed);
      setIsAuthenticated(true);
    }
  };

  const logout = () => {
    clearToken();
    setAuthContext(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, authContext, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}