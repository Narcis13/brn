/**
 * Auth API client for login and signup operations.
 */

const API_BASE = '/api';

interface AuthResponse {
  token: string;
}

interface ApiError {
  error: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.error || 'Login failed');
  }

  return response.json();
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.error || 'Signup failed');
  }

  return response.json();
}

export function storeToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function clearToken(): void {
  localStorage.removeItem('auth_token');
}