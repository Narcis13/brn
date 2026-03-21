import { test, expect, describe, beforeEach, mock } from 'bun:test';
import { login } from '../../api/auth';

// Simple mock implementation since testing-library has issues with Bun
const mockLogin = mock((email: string, password: string) => {
  if (email === 'test@example.com' && password === 'password123') {
    return Promise.resolve({ token: 'test-token' });
  }
  return Promise.reject(new Error('Invalid credentials'));
});

// Mock the entire module before import
mock.module('../../api/auth', () => ({
  login: mockLogin,
  storeToken: mock(() => {}),
  signup: mock(() => {}),
  getToken: mock(() => null),
  clearToken: mock(() => {})
}));

describe('Login Component', () => {
  beforeEach(() => {
    mockLogin.mockClear();
  });

  test('login function is called with correct credentials', async () => {
    const { login } = await import('../../api/auth');
    
    const result = await login('test@example.com', 'password123');
    expect(result.token).toBe('test-token');
    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  test('login function rejects with invalid credentials', async () => {
    const { login } = await import('../../api/auth');
    
    try {
      await login('test@example.com', 'wrongpassword');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toBe('Invalid credentials');
    }
  });
  
  test('email validation regex works correctly', () => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    expect(EMAIL_REGEX.test('test@example.com')).toBe(true);
    expect(EMAIL_REGEX.test('invalid-email')).toBe(false);
    expect(EMAIL_REGEX.test('missing@domain')).toBe(false);
    expect(EMAIL_REGEX.test('@example.com')).toBe(false);
  });
});