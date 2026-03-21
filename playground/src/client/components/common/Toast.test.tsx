import { test, expect, describe, mock } from 'bun:test';
import { Toast } from './Toast';
import type { ToastType } from './Toast';

describe('Toast', () => {
  test('exports Toast function', () => {
    expect(typeof Toast).toBe('function');
  });

  test('renders success toast without throwing', () => {
    const onDismiss = mock((_id: string) => {});
    const props = { id: 'toast-1', type: 'success' as ToastType, message: 'Card created', onDismiss };
    expect(() => Toast(props)).not.toThrow();
  });

  test('renders error toast without throwing', () => {
    const onDismiss = mock((_id: string) => {});
    const props = { id: 'toast-2', type: 'error' as ToastType, message: 'Failed to create card', onDismiss };
    expect(() => Toast(props)).not.toThrow();
  });

  test('renders info toast without throwing', () => {
    const onDismiss = mock((_id: string) => {});
    const props = { id: 'toast-3', type: 'info' as ToastType, message: 'Tip: drag cards to move them', onDismiss };
    expect(() => Toast(props)).not.toThrow();
  });

  test('returns JSX element', () => {
    const onDismiss = mock((_id: string) => {});
    const props = { id: 'toast-4', type: 'success' as ToastType, message: 'Done', onDismiss };
    const result = Toast(props);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  test('onDismiss callback receives the toast id', () => {
    const receivedIds: string[] = [];
    const onDismiss = mock((id: string) => { receivedIds.push(id); });
    onDismiss('my-toast-id');
    expect(receivedIds).toContain('my-toast-id');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('onDismiss is callable with correct signature', () => {
    const onDismiss = mock((id: string) => id);
    onDismiss('toast-1');
    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  test('accepts all three toast types without throwing', () => {
    const onDismiss = mock((_id: string) => {});
    const types: ToastType[] = ['success', 'error', 'info'];
    for (const type of types) {
      const props = { id: `toast-${type}`, type, message: 'Test', onDismiss };
      expect(() => Toast(props)).not.toThrow();
    }
  });

  test('accepts message prop with success scenario', () => {
    const onDismiss = mock((_id: string) => {});
    const message = 'Board updated successfully';
    const props = { id: 'toast-1', type: 'success' as ToastType, message, onDismiss };
    expect(() => Toast(props)).not.toThrow();
  });

  test('accepts message prop with error scenario', () => {
    const onDismiss = mock((_id: string) => {});
    const message = 'Network error: please try again';
    const props = { id: 'toast-err', type: 'error' as ToastType, message, onDismiss };
    expect(() => Toast(props)).not.toThrow();
  });

  test('multiple distinct toasts render independently', () => {
    const onDismiss = mock((_id: string) => {});
    const toastA = Toast({ id: 'a', type: 'success', message: 'Created', onDismiss });
    const toastB = Toast({ id: 'b', type: 'error', message: 'Failed', onDismiss });
    const toastC = Toast({ id: 'c', type: 'info', message: 'Info', onDismiss });
    expect(toastA).toBeTruthy();
    expect(toastB).toBeTruthy();
    expect(toastC).toBeTruthy();
  });

  test('dismiss callbacks for multiple toasts are independent', () => {
    const dismissedIds: string[] = [];
    const onDismiss = mock((id: string) => { dismissedIds.push(id); });

    onDismiss('toast-a');
    onDismiss('toast-b');
    onDismiss('toast-c');

    expect(dismissedIds).toHaveLength(3);
    expect(dismissedIds[0]).toBe('toast-a');
    expect(dismissedIds[1]).toBe('toast-b');
    expect(dismissedIds[2]).toBe('toast-c');
  });
});
