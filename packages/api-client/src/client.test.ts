import { describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  CredentialError,
  ForbiddenError,
  NetworkError,
  RoleviaApiClient,
  ServerError,
  UnauthorizedError,
  ValidationError,
} from './index.js';

describe('RoleviaApiClient', () => {
  const candidateId = 'cand_123';

  it('normalizes base URL by stripping trailing slashes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { count: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000///',
      fetcher,
    });

    await client.listOpportunities(candidateId);

    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3000/opportunities?candidateId=cand_123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('validates success response against canonical TypeBox schema', async () => {
    const profileData = {
      candidate: {
        id: candidateId,
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
      claims: [],
    };

    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(profileData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    const res = await client.getCareerProfile(candidateId);
    expect(res).toEqual(profileData);
  });

  it('throws ValidationError when response fails TypeBox schema validation', async () => {
    const invalidProfileData = {
      candidate: { invalidField: true },
    };

    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(invalidProfileData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    await expect(client.getCareerProfile(candidateId)).rejects.toThrow(
      ValidationError,
    );
  });

  it('maps 404 status to NotFoundError or returns null for getOpportunity', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Opportunity not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    const opp = await client.getOpportunity('opp_missing', candidateId);
    expect(opp).toBeNull();
  });

  it('maps 409 status to ConflictError for optimistic concurrency failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'STALE_WRITE',
          message: 'The application was updated by another process.',
        }),
        {
          status: 409,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    await expect(
      client.updateApplication(candidateId, 'app_1', {
        status: 'Applied',
        expectedUpdatedAt: '2026-08-30T00:00:00.000Z',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('maps 401 and 403 status codes correctly', async () => {
    const fetcher401 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client401 = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher: fetcher401,
    });

    await expect(client401.getCareerProfile(candidateId)).rejects.toThrow(
      UnauthorizedError,
    );

    const fetcher403 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client403 = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher: fetcher403,
    });

    await expect(client403.getCareerProfile(candidateId)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('maps 500 status to ServerError', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Internal Server Error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    await expect(client.getCareerProfile(candidateId)).rejects.toThrow(
      ServerError,
    );
  });

  it('maps network failures to NetworkError', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    await expect(client.getCareerProfile(candidateId)).rejects.toThrow(
      NetworkError,
    );
  });

  it('supports AbortSignal option', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: { count: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    const controller = new AbortController();
    await client.listOpportunities(candidateId, { signal: controller.signal });

    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('injects portable bearer or cookie credentials without changing callers', async () => {
    const session = {
      user: { id: 'usr_1', email: 'person@example.com' },
      candidateIds: [candidateId],
      primaryCandidateId: candidateId,
      expiresAt: '2026-09-07T00:00:00.000Z',
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const credentialProvider = vi.fn().mockResolvedValue({
      headers: { authorization: 'Bearer portable-token' },
      credentials: 'include' as const,
    });
    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
      credentialProvider,
    });

    await expect(client.getSession()).resolves.toEqual(session);
    expect(credentialProvider).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/session');
    expect(request?.credentials).toBe('include');
    expect(new Headers(request?.headers).get('authorization')).toBe(
      'Bearer portable-token',
    );
  });

  it('validates login input and preserves auth-envelope error messages', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'The email or password is invalid.',
          },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    await expect(
      client.login({ email: 'person@example.com', password: 'wrong' }),
    ).rejects.toThrow('The email or password is invalid.');
    await expect(client.login({ email: '', password: '' })).rejects.toThrow(
      ValidationError,
    );
  });

  it('types credential-provider failures without exposing provider details', async () => {
    const secret = 'bearer-secret-that-must-not-escape';
    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      credentialProvider: () => {
        throw new Error(secret);
      },
    });

    const error = await client.getSession().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CredentialError);
    expect(String(error)).not.toContain(secret);
  });

  it('does not retain bearer tokens in auth response validation errors', async () => {
    const token = 'raw-token-that-must-not-enter-errors';
    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ token, malformed: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });

    const error = await client
      .login({ email: 'person@example.com', password: 'wrong' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ details: undefined });
    expect(String(error)).not.toContain(token);
  });

  it('fetches getCareerSignals with schema validation', async () => {
    const mockSignals = {
      candidateId,
      generatedAt: '2026-08-31T00:00:00.000Z',
      summary: 'Market signals summary',
      activeOpportunityCount: 0,
      repeatedGaps: [],
      strongAlignments: [],
      transferableCapabilities: [],
      eligibilityUncertainties: [],
      eligibilityBlockers: [],
      evidenceGaps: [],
      marketDemand: [],
    };

    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockSignals), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const client = new RoleviaApiClient({
      baseUrl: 'http://localhost:3000',
      fetcher,
    });

    const signals = await client.getCareerSignals(candidateId);
    expect(signals).toEqual(mockSignals);
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3000/candidates/${candidateId}/career-signals`,
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
