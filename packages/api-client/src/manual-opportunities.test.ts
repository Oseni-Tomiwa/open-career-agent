import { expect, it, vi } from 'vitest';
import { RoleviaApiClient } from './client.js';

it('sends a candidate-scoped manual edit with a strong conditional version and cloud credentials', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'record',
      category: 'GRANT',
      title: 'Example',
      organization: 'Foundation',
      sourceUrl: null,
      sourceContext: 'Email',
      deadline: '2028-02-29',
      version: 2,
      createdAt: '2026-11-06T00:00:00Z',
      updatedAt: '2026-11-06T00:00:00Z',
      provenance: { kind: 'MANUAL', verification: 'UNVERIFIED' },
      evaluationState: 'NOT_EVALUATED',
    }),
  );
  const api = new RoleviaApiClient({
    baseUrl: 'https://example.invalid',
    fetcher,
    credentialProvider: () => ({ credentials: 'include' }),
  });
  const input = {
    category: 'GRANT',
    title: 'Example',
    organization: 'Foundation',
    sourceContext: 'Email',
    deadline: '2028-02-29',
  } as const;
  expect(
    (await api.editManualOpportunity('candidate/a', 'record', 1, input))
      .deadline,
  ).toBe('2028-02-29');
  expect(fetcher).toHaveBeenCalledWith(
    'https://example.invalid/candidates/candidate%2Fa/manual-opportunities/record',
    expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      headers: expect.objectContaining({ 'If-Match': '"v1"' }),
      body: JSON.stringify(input),
    }),
  );
});
