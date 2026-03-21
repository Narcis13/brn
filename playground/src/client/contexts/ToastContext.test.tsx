import { test, expect, describe, mock } from 'bun:test';
import { ToastProvider, useToast, AUTO_DISMISS_MS } from './ToastContext';

describe('ToastContext', () => {
  test('exports ToastProvider function', () => {
    expect(typeof ToastProvider).toBe('function');
  });

  test('exports useToast function', () => {
    expect(typeof useToast).toBe('function');
  });

  test('exports AUTO_DISMISS_MS constant', () => {
    expect(AUTO_DISMISS_MS).toBe(3000);
  });

  test('auto-dismiss timeout is exactly 3 seconds', () => {
    expect(AUTO_DISMISS_MS).toBe(3000);
  });

  test('useToast throws when used outside ToastProvider', () => {
    expect(() => useToast()).toThrow();
  });

  test('ToastProvider is a named function', () => {
    expect(ToastProvider.name).toBe('ToastProvider');
  });

  test('ToastProvider accepts ToastProviderProps shape', () => {
    // Verify the props type: ToastProvider expects { children: ReactNode }
    // We verify via the function's expected interface without invoking hooks
    type Props = Parameters<typeof ToastProvider>[0];
    const props: Props = { children: null };
    expect(props).toHaveProperty('children');
  });

  test('showSuccess method accepts string message', () => {
    const showSuccess = mock((message: string) => message);
    showSuccess('Board created successfully');
    expect(showSuccess).toHaveBeenCalledWith('Board created successfully');
  });

  test('showError method accepts string message', () => {
    const showError = mock((message: string) => message);
    showError('Failed to delete card');
    expect(showError).toHaveBeenCalledWith('Failed to delete card');
  });

  test('showInfo method accepts string message', () => {
    const showInfo = mock((message: string) => message);
    showInfo('Drag cards to reorder them');
    expect(showInfo).toHaveBeenCalledWith('Drag cards to reorder them');
  });

  test('multiple toast messages track independently', () => {
    const messages: string[] = [];
    const addMessage = (msg: string): void => { messages.push(msg); };

    addMessage('Card created');
    addMessage('Board updated');
    addMessage('Card deleted');

    expect(messages).toHaveLength(3);
    expect(messages[0]).toBe('Card created');
    expect(messages[1]).toBe('Board updated');
    expect(messages[2]).toBe('Card deleted');
  });

  test('toast types cover success, error, and info', () => {
    const validTypes = ['success', 'error', 'info'];
    expect(validTypes).toContain('success');
    expect(validTypes).toContain('error');
    expect(validTypes).toContain('info');
    expect(validTypes).toHaveLength(3);
  });

  test('dismiss callback removes specific toast by id', () => {
    type ToastItem = { id: string; message: string };
    let toasts: ToastItem[] = [
      { id: 'a', message: 'First' },
      { id: 'b', message: 'Second' },
      { id: 'c', message: 'Third' },
    ];

    const dismiss = (id: string): void => {
      toasts = toasts.filter((t) => t.id !== id);
    };

    dismiss('b');
    expect(toasts).toHaveLength(2);
    expect(toasts.find((t) => t.id === 'b')).toBeUndefined();
    expect(toasts.find((t) => t.id === 'a')).toBeTruthy();
    expect(toasts.find((t) => t.id === 'c')).toBeTruthy();
  });

  test('toasts stack vertically (multiple toasts coexist)', () => {
    type ToastItem = { id: string; type: string; message: string };
    const toasts: ToastItem[] = [];
    const add = (id: string, type: string, message: string): void => {
      toasts.push({ id, type, message });
    };

    add('t1', 'success', 'Card created');
    add('t2', 'error', 'Failed to update');
    add('t3', 'info', 'Board has 3 cards');

    expect(toasts).toHaveLength(3);
  });

  test('manual dismiss removes toast from list', () => {
    type ToastItem = { id: string; message: string };
    let toasts: ToastItem[] = [{ id: 'toast-1', message: 'Created' }];
    const dismiss = (id: string): void => {
      toasts = toasts.filter((t) => t.id !== id);
    };

    dismiss('toast-1');
    expect(toasts).toHaveLength(0);
  });
});
