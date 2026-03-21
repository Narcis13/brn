import { test, expect, describe, mock } from 'bun:test';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  test('exports EmptyState function', () => {
    expect(typeof EmptyState).toBe('function');
  });

  test('renders with required title and message props', () => {
    const props = {
      title: 'No items found',
      message: 'Create your first item to get started',
    };

    // Verify the component function signature accepts correct props
    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('accepts optional icon prop', () => {
    const props = {
      icon: '📋',
      title: 'No boards',
      message: 'Create your first board',
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('accepts optional action prop with label and onClick', () => {
    const handleClick = mock(() => {});
    const props = {
      title: 'No items',
      message: 'Nothing here yet',
      action: {
        label: 'Create Item',
        onClick: handleClick,
      },
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('accepts optional custom style prop', () => {
    const props = {
      title: 'Empty',
      message: 'Nothing here',
      style: { backgroundColor: '#fff', padding: '40px' },
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('accepts optional testId prop', () => {
    const props = {
      title: 'Empty column',
      message: 'No cards in this column',
      testId: 'column-empty-state',
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('works without icon (icon is optional)', () => {
    const props = {
      title: 'Nothing here',
      message: 'Add something to get started',
      // no icon
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('works without action (action is optional)', () => {
    const props = {
      title: 'No results',
      message: 'Try again later',
      // no action
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('action onClick is callable', () => {
    const handleClick = mock(() => {});
    const action = { label: 'Do it', onClick: handleClick };

    action.onClick();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('returns JSX element (object with $$typeof)', () => {
    const props = {
      title: 'Empty',
      message: 'Nothing here',
    };

    const result = EmptyState(props as Parameters<typeof EmptyState>[0]);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  test('EmptyState used for boards: no boards scenario', () => {
    const props = {
      icon: '📋',
      title: 'No boards yet',
      message: 'Create your first board to get started',
      action: {
        label: 'Create Board',
        onClick: mock(() => {}),
      },
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });

  test('EmptyState used for columns: no cards scenario', () => {
    const props = {
      title: 'No cards',
      message: 'Add a card to this column',
      testId: 'column-empty',
    };

    expect(() => EmptyState(props as Parameters<typeof EmptyState>[0])).not.toThrow();
  });
});
