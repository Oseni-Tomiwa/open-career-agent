import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeedProductRepository } from '../data/seedRepository.js';
import { renderProduct } from '../test/render.js';
import AgentActivityPage from './activity/AgentActivityPage.js';
import MatchesPage from './matches/MatchesPage.js';
import { CareerSignalsPage } from './signals/CareerSignalsPage.js';
import { TodayPage } from './today/TodayPage.js';

describe('read-only primary surfaces', () => {
  it('do not invoke any candidate, search, evaluation, decision, or application mutation', async () => {
    const repository = new SeedProductRepository();
    const mutations = [
      vi.spyOn(repository, 'createCandidateClaim'),
      vi.spyOn(repository, 'updateCandidateClaim'),
      vi.spyOn(repository, 'attachClaimEvidence'),
      vi.spyOn(repository, 'createSearchTarget'),
      vi.spyOn(repository, 'updateSearchTarget'),
      vi.spyOn(repository, 'deleteSearchTarget'),
      vi.spyOn(repository, 'runDiscovery'),
      vi.spyOn(repository, 'setOpportunityDecision'),
      vi.spyOn(repository, 'createApplication'),
      vi.spyOn(repository, 'updateApplication'),
      vi.spyOn(repository, 'addApplicationEvent'),
    ];

    const surfaces = [
      { element: <TodayPage />, heading: /Good afternoon/ },
      { element: <MatchesPage />, heading: /^Matches$/ },
      { element: <CareerSignalsPage />, heading: /^Career Insights$/ },
      { element: <AgentActivityPage />, heading: /^Agent Activity$/ },
    ];
    for (const surface of surfaces) {
      const view = renderProduct(surface.element, ['/'], repository);
      await screen.findByRole('heading', { name: surface.heading });
      view.unmount();
    }

    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
  });
});
