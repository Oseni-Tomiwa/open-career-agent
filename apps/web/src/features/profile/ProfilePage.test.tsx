import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiProductRepository } from '../../data/apiProductRepository.js';
import { renderProduct } from '../../test/render.js';
import { ProfilePage } from './ProfilePage.js';

const timestamp = '2026-08-30T12:00:00.000Z';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function profileBody() {
  return {
    candidate: {
      id: 'candidate-api-profile',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    claims: [
      {
        id: 'claim-supported',
        kind: 'skill',
        value: 'Node.js',
        scope: null,
        state: 'SUPPORTED',
        confidence: 'HIGH',
        createdAt: timestamp,
        updatedAt: timestamp,
        evidence: [
          {
            id: 'evidence-node',
            evidenceType: 'project reference',
            sourceReference: 'portfolio:backend',
            excerpt: 'Delivered a production Node.js service.',
            state: 'candidate-confirmed',
            createdAt: timestamp,
          },
        ],
      },
      {
        id: 'claim-unknown',
        kind: 'skill',
        value: 'Kubernetes',
        scope: null,
        state: 'UNKNOWN',
        confidence: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        evidence: [],
      },
      {
        id: 'claim-conflicting',
        kind: 'work_authorization',
        value: 'US work authorization',
        scope: 'us',
        state: 'CONFLICTING',
        confidence: 'HIGH',
        createdAt: timestamp,
        updatedAt: timestamp,
        evidence: [
          {
            id: 'evidence-conflict',
            evidenceType: 'candidate correction',
            sourceReference: 'manual:correction',
            excerpt: 'Current authorization evidence conflicts.',
            state: 'disputed',
            createdAt: timestamp,
          },
        ],
      },
    ],
  } as const;
}

function apiRepository(fetcher: typeof fetch) {
  return new ApiProductRepository(
    'http://api.test',
    'candidate-api-profile',
    fetcher,
  );
}

describe('Career Memory profile', () => {
  it('keeps the seed profile functional with canonical claim states', async () => {
    renderProduct(<ProfilePage />);
    expect(
      await screen.findByRole('heading', { name: 'Career Profile' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getAllByText('Supported').length).toBeGreaterThan(0);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders API claims, states, scope, confidence, and Evidence without seed leakage', async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/opportunities?'))
        return Promise.resolve(response({ data: [] }));
      return Promise.resolve(response(profileBody()));
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));

    expect(await screen.findByText('Node.js')).toBeInTheDocument();
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.getByText('US work authorization')).toBeInTheDocument();
    expect(screen.getByText('us')).toBeInTheDocument();
    expect(
      screen.getByText('Delivered a production Node.js service.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No supported evidence recorded. Unknown is not a negative claim.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Evidence sources disagree. The contradiction remains unresolved.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
  });

  it('sends canonical create and Evidence mutations through ApiProductRepository', async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/opportunities?'))
        return Promise.resolve(response({ data: [] }));
      if (url.endsWith('/profile'))
        return Promise.resolve(response(profileBody()));
      return Promise.resolve(
        response({ ...profileBody(), reevaluationRequested: true }, 201),
      );
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    await screen.findByText('Node.js');

    fireEvent.click(screen.getByRole('button', { name: 'Add profile item' }));
    fireEvent.change(screen.getByLabelText('Profile category'), {
      target: { value: 'language' },
    });
    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'German' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile item' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        'http://api.test/candidates/candidate-api-profile/claims',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const createCall = fetcher.mock.calls.find(([input]) => {
      const target =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return target.endsWith('/claims');
    })!;
    const createBody =
      typeof createCall[1]?.body === 'string' ? createCall[1].body : '';
    expect(JSON.parse(createBody)).toMatchObject({
      kind: 'language',
      value: 'German',
      state: 'UNKNOWN',
    });

    const unknownCard = screen.getByText('Kubernetes').closest('article')!;
    fireEvent.click(
      within(unknownCard).getByRole('button', { name: 'Confirm as supported' }),
    );
    fireEvent.change(
      within(unknownCard).getByLabelText('Evidence excerpt or value'),
      { target: { value: 'I used Kubernetes in a project.' } },
    );
    fireEvent.click(
      within(unknownCard).getByRole('button', { name: 'Attach Evidence' }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        'http://api.test/candidates/candidate-api-profile/claims/claim-unknown/evidence',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const evidenceCall = fetcher.mock.calls.find(([input]) => {
      const target =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return target.endsWith('/claim-unknown/evidence');
    })!;
    const evidenceBody =
      typeof evidenceCall[1]?.body === 'string' ? evidenceCall[1].body : '';
    expect(JSON.parse(evidenceBody)).toMatchObject({
      transitionTo: 'SUPPORTED',
      evidence: {
        state: 'candidate-confirmed',
        excerpt: 'I used Kubernetes in a project.',
      },
    });
  });

  it('renders mutation failures without replacing API data with seed data', async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes('/opportunities?'))
        return Promise.resolve(response({ data: [] }));
      if (url.endsWith('/profile'))
        return Promise.resolve(response(profileBody()));
      return Promise.resolve(
        response({ error: { code: 'INVALID_TRANSITION' } }, 409),
      );
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    await screen.findByText('Node.js');
    fireEvent.click(screen.getByRole('button', { name: 'Add profile item' }));
    fireEvent.change(screen.getByLabelText('Profile category'), {
      target: { value: 'skill' },
    });
    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'Rust' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 409');
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
  });
});
