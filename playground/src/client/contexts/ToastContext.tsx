import * as React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Toast } from '../components/common/Toast';
import type { ToastType } from '../components/common/Toast';

export const AUTO_DISMISS_MS = 3000;

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string): void => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const showSuccess = useCallback((message: string): void => {
    addToast('success', message);
  }, [addToast]);

  const showError = useCallback((message: string): void => {
    addToast('error', message);
  }, [addToast]);

  const showInfo = useCallback((message: string): void => {
    addToast('info', message);
  }, [addToast]);

  const dismissToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
  };

  const toastStyle: React.CSSProperties = {
    pointerEvents: 'auto',
  };

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo }}>
      {children}
      {toasts.length > 0 && (
        <div data-testid="toast-container" style={containerStyle}>
          {toasts.map((toast) => (
            <div key={toast.id} style={toastStyle}>
              <Toast
                id={toast.id}
                type={toast.type}
                message={toast.message}
                onDismiss={dismissToast}
              />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
