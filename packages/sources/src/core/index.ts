export interface SourceOpportunity {
  sourceSystem: string;
  sourceExternalId: string;
  sourceUrl?: string;
  rawPayload: string;
  observedAt: Date;
  updatedAt?: Date;
}

export interface SourceAdapter {
  readonly sourceSystem: string;
  discover(boardId: string): AsyncIterableIterator<SourceOpportunity>;
}

export interface NormalizedOpportunity {
  title: string;
  organization: string;
  content: string;
  location?: string;
  workModel?: string;
  employmentType?: string;
  compensation?: string;
}

export interface OpportunityNormalizer {
  normalize(record: SourceOpportunity): NormalizedOpportunity;
  hash(normalized: NormalizedOpportunity): string;
}
