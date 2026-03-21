import * as React from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onDismiss: (id: string) => void;
}

const typeColors: Record<ToastType, string> = {
  success: '#4caf50',
  error: '#f44336',
  info: '#2196f3',
};

const typeIcons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export function Toast({ id, type, message, onDismiss }: ToastProps): JSX.Element {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    marginBottom: '8px',
    borderRadius: '6px',
    backgroundColor: typeColors[type],
    color: 'white',
    minWidth: '280px',
    maxWidth: '480px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    cursor: 'pointer',
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
  };

  const dismissStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '0 0 0 12px',
    lineHeight: '1',
    opacity: 0.8,
    flexShrink: 0,
  };

  return (
    <div
      data-testid={`toast-${id}`}
      style={containerStyle}
      onClick={() => onDismiss(id)}
    >
      <span style={contentStyle}>
        <span data-testid="toast-icon">{typeIcons[type]}</span>
        <span data-testid="toast-message">{message}</span>
      </span>
      <button
        data-testid="toast-dismiss"
        style={dismissStyle}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
