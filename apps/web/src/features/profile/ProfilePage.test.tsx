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

function profileFetcher(body: unknown) {
  return vi.fn<typeof fetch>((input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes('/opportunities?')) {
      return Promise.resolve(response({ data: [] }));
    }
    return Promise.resolve(response(body));
  });
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

  it('keeps an empty profile usable without pressuring the user to complete it', async () => {
    const fetcher = profileFetcher({
      candidate: profileBody().candidate,
      claims: [],
      historicalClaims: [],
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    expect(
      await screen.findByText('Career Profile is empty'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add a factual profile item and attach evidence when it is available.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });

  it('renders a 100-fact current profile with grouped controls intact', async () => {
    const claims = Array.from({ length: 100 }, (_, index) => ({
      ...profileBody().claims[1],
      id: `claim-large-${index}`,
      value: `Synthetic large-profile fact ${index + 1}`,
    }));
    const fetcher = profileFetcher({
      candidate: profileBody().candidate,
      claims,
      historicalClaims: [],
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    expect(
      await screen.findByText('Synthetic large-profile fact 100'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('100 profile items with 0 supporting evidence items'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add multiple facts' }),
    ).toBeEnabled();
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
        response(
          {
            ...profileBody(),
            reevaluationRequested: true,
            reevaluation: {
              id: 'profile-reevaluation-test',
              state: 'SUCCEEDED',
              taskCount: 0,
              completedTaskCount: 0,
              failedTaskCount: 0,
              requestedAt: timestamp,
              updatedAt: timestamp,
            },
          },
          201,
        ),
      );
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    await screen.findByText('Node.js');

    fireEvent.click(screen.getByRole('button', { name: 'Add multiple facts' }));
    fireEvent.change(screen.getByLabelText('Profile category'), {
      target: { value: 'language' },
    });
    fireEvent.change(screen.getByLabelText('Fact'), {
      target: { value: 'German' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review facts' }));
    expect(screen.getByText('Review facts before saving')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 fact' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        'http://api.test/candidates/candidate-api-profile/claims/batch',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText(
        'Career Profile saved. Reevaluation completed for 0 current opportunities.',
      ),
    ).toBeInTheDocument();
    const createCall = fetcher.mock.calls.find(([input]) => {
      const target =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return target.endsWith('/claims/batch');
    })!;
    const createBody =
      typeof createCall[1]?.body === 'string' ? createCall[1].body : '';
    expect(JSON.parse(createBody)).toMatchObject({
      claims: [{ kind: 'language', value: 'German', state: 'UNKNOWN' }],
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
    fireEvent.click(screen.getByRole('button', { name: 'Add multiple facts' }));
    fireEvent.change(screen.getByLabelText('Profile category'), {
      target: { value: 'skill' },
    });
    fireEvent.change(screen.getByLabelText('Fact'), {
      target: { value: 'Rust' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review facts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 fact' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status 409');
    expect(screen.queryByText('Docker')).not.toBeInTheDocument();
  });

  it('authors explicit development succession, exposes history, and retires safely', async () => {
    const lifecycleProfile = {
      ...profileBody(),
      claims: [
        ...profileBody().claims,
        {
          ...profileBody().claims[1],
          id: 'claim-current-correction',
          value: 'Synthetic corrected current fact',
          predecessorClaimId: 'claim-old-correction',
          successionType: 'CORRECTION',
          successionNote: 'Synthetic correction note.',
        },
      ],
      historicalClaims: [
        {
          ...profileBody().claims[1],
          id: 'claim-old-python',
          value: 'Python',
          scope: 'Beginner',
          lifecycleState: 'SUPERSEDED',
          successionType: null,
          successionNote: null,
          predecessorClaimId: null,
          endedAt: timestamp,
          evidence: [
            {
              id: 'evidence-old-python',
              evidenceType: 'candidate statement',
              sourceReference: 'candidate-confirmed/manual',
              excerpt: 'Historical beginner evidence.',
              state: 'candidate-confirmed',
              createdAt: timestamp,
            },
          ],
        },
        {
          ...profileBody().claims[1],
          id: 'claim-old-correction',
          value: 'Synthetic incorrect historical fact',
          lifecycleState: 'SUPERSEDED',
          successionType: null,
          successionNote: null,
          predecessorClaimId: null,
          endedAt: timestamp,
          evidence: [],
        },
      ],
    };
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
        return Promise.resolve(response(lifecycleProfile));
      return Promise.resolve(
        response(
          {
            ...lifecycleProfile,
            reevaluationRequested: true,
            reevaluation: {
              id: 'profile-reevaluation-lifecycle',
              state: 'PENDING',
              taskCount: 2,
              completedTaskCount: 0,
              failedTaskCount: 0,
              requestedAt: timestamp,
              updatedAt: timestamp,
            },
          },
          url.endsWith('/retire') ? 200 : 201,
        ),
      );
    });
    renderProduct(<ProfilePage />, ['/profile'], apiRepository(fetcher));
    const nodeCard = (await screen.findByText('Node.js')).closest('article')!;
    fireEvent.click(
      within(nodeCard).getByRole('button', { name: 'Correct or update' }),
    );
    fireEvent.click(
      within(nodeCard).getByLabelText(
        /Professional development — the previous information was true/,
      ),
    );
    fireEvent.change(within(nodeCard).getByLabelText('Updated scope'), {
      target: { value: 'Intermediate' },
    });
    fireEvent.change(
      within(nodeCard).getByLabelText(
        'Supporting statement for the updated fact',
      ),
      { target: { value: 'Synthetic development evidence.' } },
    );
    fireEvent.click(
      within(nodeCard).getByRole('button', { name: 'Confirm update' }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        'http://api.test/candidates/candidate-api-profile/claims/claim-supported/replace',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const replaceCall = fetcher.mock.calls.find(([input]) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return url.endsWith('/claim-supported/replace');
    })!;
    const replaceBody = replaceCall[1]?.body;
    expect(
      JSON.parse(typeof replaceBody === 'string' ? replaceBody : '{}'),
    ).toMatchObject({
      changeType: 'DEVELOPMENT',
      scope: 'Intermediate',
      evidence: { excerpt: 'Synthetic development evidence.' },
    });

    expect(screen.getByText('Profile history (2)')).toBeInTheDocument();
    expect(screen.getByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText('Synthetic correction note.')).toBeInTheDocument();
    expect(
      screen.getByText('This current fact corrects an earlier profile item.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Historical beginner evidence.'),
    ).toBeInTheDocument();

    const unknownCard = screen.getByText('Kubernetes').closest('article')!;
    fireEvent.click(
      within(unknownCard).getByRole('button', { name: 'No longer current' }),
    );
    fireEvent.click(
      within(unknownCard).getByRole('button', {
        name: 'Confirm no longer current',
      }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        'http://api.test/candidates/candidate-api-profile/claims/claim-unknown/retire',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
