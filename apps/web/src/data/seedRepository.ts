import { initialSeedSnapshot } from './seed.js';
import type {
  Decision,
  Opportunity,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
} from './types.js';

export class SeedProductRepository implements ProductRepository {
  public readonly dataSource = 'seed' as const;
  private snapshot: ProductSnapshot = initialSeedSnapshot;

  public async getSnapshot(): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public async getOpportunity(opportunityId: string): Promise<Opportunity | null> {
    return Promise.resolve(
      this.snapshot.opportunities.find((item) => item.id === opportunityId) ??
        null,
    );
  }

  public async setOpportunityDecision(
    _opportunityId: string,
    _decision: Decision,
  ): Promise<ProductSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  public async saveSearchPreferences(
    preferences: SearchPreferences,
  ): Promise<ProductSnapshot> {
    this.snapshot = { ...this.snapshot, searchPreferences: preferences };
    return Promise.resolve(this.snapshot);
  }
}
