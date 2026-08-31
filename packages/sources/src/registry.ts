import type { OpportunityNormalizer, SourceAdapter } from './core/index.js';
import { GreenhouseAdapter } from './greenhouse/adapter.js';
import { GreenhouseNormalizer } from './greenhouse/normalizer.js';
import { LeverAdapter } from './lever/adapter.js';
import { LeverNormalizer } from './lever/normalizer.js';
import { AshbyAdapter } from './ashby/adapter.js';
import { AshbyNormalizer } from './ashby/normalizer.js';

const adapters: Record<string, () => SourceAdapter> = {
  greenhouse: () => new GreenhouseAdapter(),
  lever: () => new LeverAdapter(),
  ashby: () => new AshbyAdapter(),
};

const normalizers: Record<string, () => OpportunityNormalizer> = {
  greenhouse: () => new GreenhouseNormalizer(),
  lever: () => new LeverNormalizer(),
  ashby: () => new AshbyNormalizer(),
};

export function getSourceAdapter(sourceSystem: string): SourceAdapter {
  const normalized = sourceSystem.toLowerCase().trim();
  const factory = adapters[normalized];
  if (!factory) {
    throw new Error(`Unsupported source system: '${sourceSystem}'`);
  }
  return factory();
}

export function getSourceNormalizer(
  sourceSystem: string,
): OpportunityNormalizer {
  const normalized = sourceSystem.toLowerCase().trim();
  const factory = normalizers[normalized];
  if (!factory) {
    throw new Error(`Unsupported source system: '${sourceSystem}'`);
  }
  return factory();
}
