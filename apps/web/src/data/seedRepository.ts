import { initialSeedSnapshot } from './seed.js';
import type {
  Decision,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
} from './types.js';

export class SeedProductRepository implements ProductRepository {
  private snapshot: ProductSnapshot = initialSeedSnapshot;

  public async getSnapshot(): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public async setOpportunityDecision(
    opportunityId: string,
    decision: Decision,
  ): Promise<ProductSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      opportunities: this.snapshot.opportunities.map((opportunity) =>
        opportunity.id === opportunityId
          ? {
              ...opportunity,
              decision,
              decisionLabel: decisionLabel(decision),
            }
          : opportunity,
      ),
    };
    return Promise.resolve(this.snapshot);
  }

  public async saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot> {
    this.snapshot = { ...this.snapshot, searchPreferences: preferences };
    return Promise.resolve(this.snapshot);
  }
}

function decisionLabel(decision: Decision): string {
  switch (decision) {
    case 'high-priority':
      return 'High priority';
    case 'consider':
      return 'Shortlisted';
    case 'investigate':
      return 'Needs investigation';
    case 'low-priority':
      return 'Dismissed for now';
    case 'ineligible':
      return 'Not eligible';
  }
}
