import { describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
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
    const fetcher = vi.fn().mockResolvedValue(
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
});
