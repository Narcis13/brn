import { test, expect, describe } from 'bun:test';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  test('exports LoadingSpinner function', () => {
    expect(typeof LoadingSpinner).toBe('function');
  });

  test('renders with no required props (all optional)', () => {
    expect(() => LoadingSpinner({})).not.toThrow();
  });

  test('accepts custom size prop', () => {
    const props = { size: 48 };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });

  test('accepts custom color prop', () => {
    const props = { color: '#ff5733' };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });

  test('accepts custom label prop', () => {
    const props = { label: 'Fetching boards...' };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });

  test('accepts custom style prop', () => {
    const props = { style: { padding: '40px', backgroundColor: '#fff' } };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });

  test('accepts custom testId prop', () => {
    const props = { testId: 'board-list-spinner' };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });

  test('returns JSX element', () => {
    const result = LoadingSpinner({});
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  test('works with all props combined', () => {
    const props = {
      size: 40,
      color: '#4CAF50',
      label: 'Loading data...',
      style: { padding: '16px' },
      testId: 'custom-spinner',
    };
    expect(() => LoadingSpinner(props)).not.toThrow();
  });
});
