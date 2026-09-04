import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RoleviaApiClient } from '@oca/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicApplication } from './PublicApplication.js';

describe('Rolevia public application', () => {
  const completeVerification = vi.fn();
  const requestPasswordReset = vi.fn();
  const completePasswordReset = vi.fn();

  const client = {
    getAuthCapabilities: vi.fn().mockResolvedValue({
      providers: { google: false, apple: false },
      developmentEmailDelivery: true,
    }),
    oauthStartUrl: vi.fn(
      (provider: string) => `https://api.test/auth/oauth/${provider}/start`,
    ),
    login: vi.fn(),
    register: vi.fn(),
    completeVerification,
    requestPasswordReset,
    completePasswordReset,
    getSession: vi.fn(),
  } as unknown as RoleviaApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('renders a truthful public navbar and large-type footer without fake destinations', () => {
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      screen.getByRole('navigation', { name: 'Public navigation' }),
    ).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Footer navigation' }),
    ).toBeVisible();
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href')),
    ).not.toContain('#');
    expect(screen.getByText('ROLEVIA')).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.queryByText(/facebook|linkedin|microsoft/i),
    ).not.toBeInTheDocument();
  });

  it('switches between route-backed sign-in and create-account modes', async () => {
    window.history.replaceState({}, '', '/sign-in');
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getAllByRole('link', { name: 'Create account' }).at(-1)!,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Create your Rolevia account',
      }),
    ).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'email',
    );
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(
      screen.getByRole('button', { name: /Continue with Google/ }),
    ).toBeDisabled();
  });

  it('renders a public editorial 404 with a working home destination', () => {
    window.history.replaceState({}, '', '/missing-public-path');
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      screen.getByRole('heading', {
        name: 'This path does not lead anywhere yet.',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders and submits forgot password form', async () => {
    window.history.replaceState({}, '', '/forgot-password');
    requestPasswordReset.mockResolvedValueOnce({
      accepted: true,
      message:
        'If that account can reset its password, an email is on its way.',
    });

    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      await screen.findByRole('heading', { name: 'Reset your password' }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'forgot@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(
      await screen.findByText(
        'If that account can reset its password, an email is on its way.',
      ),
    ).toBeVisible();
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'forgot@example.com',
    });
  });

  it('renders and submits reset password form with token', async () => {
    window.history.replaceState(
      {},
      '',
      '/reset-password?token=valid-reset-token',
    );
    completePasswordReset.mockResolvedValueOnce({
      accepted: true,
      message: 'Your password has been changed. You can now sign in.',
    });

    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      await screen.findByRole('heading', { name: 'Choose a new password' }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-valid-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(
      await screen.findByText(
        'Your password has been changed. You can now sign in.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Continue to sign in' }),
    ).toBeVisible();
  });

  it('renders verify email page and completes verification on action', async () => {
    window.history.replaceState(
      {},
      '',
      '/verify-email?token=valid-verify-token',
    );
    const onAuth = vi.fn();
    const mockSession = {
      user: { id: 'usr_verified', email: 'verified@example.com' },
      candidateIds: ['cand_verified'],
      primaryCandidateId: 'cand_verified',
      expiresAt: '2026-09-07T00:00:00.000Z',
    };
    completeVerification.mockResolvedValueOnce({
      session: mockSession,
    });

    render(<PublicApplication client={client} onAuthenticated={onAuth} />);
    expect(
      await screen.findByRole('heading', { name: 'Verify your email' }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));

    await waitFor(() => {
      expect(onAuth).toHaveBeenCalledWith(mockSession);
    });
  });

  it('toggles theme in public navbar', () => {
    window.history.replaceState({}, '', '/');
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    const themeButton = screen.getByRole('button', {
      name: /Use (dark|light) theme/i,
    });
    expect(themeButton).toBeVisible();

    fireEvent.click(themeButton);
    expect(window.localStorage.getItem('oca-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    fireEvent.click(themeButton);
    expect(window.localStorage.getItem('oca-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('handles cancelled OAuth callback', () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback?status=cancelled&provider=google',
    );
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Sign-in interrupted' }),
    ).toBeVisible();
    expect(screen.getByText('Social sign-in was cancelled.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Return to sign in' }),
    ).toBeVisible();
  });

  it('renders all core landing page sections and switches preview tabs', () => {
    window.history.replaceState({}, '', '/');
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);

    // Hero
    expect(
      screen.getByRole('heading', {
        name: 'See your career with greater clarity.',
      }),
    ).toBeVisible();
    expect(screen.getByText('Eligible', { exact: true })).toBeVisible();
    expect(screen.getByText('Strong fit evidence')).toBeVisible();
    expect(screen.queryByText(/88%|92%|84%/)).not.toBeInTheDocument();

    // Section headings
    expect(
      screen.getByRole('heading', {
        name: 'Inspect real evidence, not decorative summaries.',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'How Rolevia Works' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'Built on truth, not mysterious probabilities.',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'Principles of Evidence-Led Intelligence',
      }),
    ).toBeVisible();

    // Switch preview tab to Overview
    const overviewTab = screen.getByRole('tab', {
      name: 'Daily Overview & Decisions',
    });
    fireEvent.click(overviewTab);
    expect(
      screen.getByRole('heading', {
        name: 'Daily Overview & Decisions Ledger',
      }),
    ).toBeVisible();

    // Switch preview tab to Career Profile
    const profileTab = screen.getByRole('tab', {
      name: 'Career Profile & Claims',
    });
    fireEvent.click(profileTab);
    expect(
      screen.getByRole('heading', { name: 'Factual Career Memory' }),
    ).toBeVisible();
  });

  it('renders all dedicated public informational routes', () => {
    // /how-it-works
    window.history.replaceState({}, '', '/how-it-works');
    const { unmount: unmount1 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', {
        name: 'How Rolevia Evaluates Opportunities',
      }),
    ).toBeVisible();
    unmount1();

    // /features
    window.history.replaceState({}, '', '/features');
    const { unmount: unmount2 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Rolevia Features' }),
    ).toBeVisible();
    unmount2();

    // /pricing
    window.history.replaceState({}, '', '/pricing');
    const { unmount: unmount3 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Rolevia Developer Preview' }),
    ).toBeVisible();
    unmount3();

    // /about
    window.history.replaceState({}, '', '/about');
    const { unmount: unmount4 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'About Rolevia' }),
    ).toBeVisible();
    unmount4();

    // /privacy
    window.history.replaceState({}, '', '/privacy');
    const { unmount: unmount5 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Privacy Notice' }),
    ).toBeVisible();
    unmount5();

    // /terms
    window.history.replaceState({}, '', '/terms');
    const { unmount: unmount6 } = render(
      <PublicApplication client={client} onAuthenticated={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { name: 'Terms of Service' }),
    ).toBeVisible();
    unmount6();
  });

  it('toggles password visibility and evaluates requirements checklist', () => {
    window.history.replaceState({}, '', '/create-account');
    render(<PublicApplication client={client} onAuthenticated={vi.fn()} />);

    const passwordInput = screen.getByLabelText(/^Password/);
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: 'Show password' });
    fireEvent.click(toggleBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeVisible();

    // Requirements indicator updates
    expect(screen.getByText('At least 12 characters')).toBeVisible();
    fireEvent.change(passwordInput, {
      target: { value: 'short' },
    });
    const indicator = screen.getByText('At least 12 characters');
    expect(indicator).toHaveClass('unmet');

    fireEvent.change(passwordInput, {
      target: { value: 'a-sufficiently-long-password' },
    });
    expect(indicator).toHaveClass('met');
  });

  it('provides isolated development profile shortcut and opens mobile navigation', () => {
    window.history.replaceState({}, '', '/sign-in');
    const onAuth = vi.fn();
    render(<PublicApplication client={client} onAuthenticated={onAuth} />);

    // Dev profile card
    expect(screen.getByText('[DEV ONLY] Development profile')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with development profile' }),
    );
    expect(onAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: 'developer@rolevia.test' }),
      }),
    );

    // Mobile navigation toggle
    const mobileToggle = screen.getByRole('button', {
      name: 'Open navigation menu',
    });
    fireEvent.click(mobileToggle);
    expect(
      screen.getByRole('dialog', { name: 'Mobile navigation' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close navigation menu' }),
    );
    expect(
      screen.queryByRole('dialog', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
  });
});
