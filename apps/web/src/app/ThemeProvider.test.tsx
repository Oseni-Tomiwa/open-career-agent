import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeProvider, useTheme } from './ThemeProvider.js';

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span>{preference}</span>
      <span>{resolvedTheme}</span>
      <button onClick={() => setPreference('dark')} type="button">
        Dark
      </button>
      <button onClick={() => setPreference('system')} type="button">
        System
      </button>
    </div>
  );
}

describe('theme behavior', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('applies and persists an explicit dark theme', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('oca-theme')).toBe('dark');
  });

  it('supports system theme as a real preference', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    expect(screen.getByText('system')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});
