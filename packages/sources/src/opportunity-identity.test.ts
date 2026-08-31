import { describe, expect, it } from 'vitest';

import {
  deriveOpportunityIdentityEvidence,
  normalizeCanonicalJobUrl,
  type NormalizedOpportunity,
  type SourceOpportunity,
} from './index.js';

const normalized: NormalizedOpportunity = {
  title: 'Platform Engineer',
  organization: 'Acme',
  location: 'Remote',
  content: 'Build systems',
};

function source(raw: Record<string, unknown>): SourceOpportunity {
  return {
    sourceSystem: 'greenhouse',
    sourceExternalId: 'provider-local-id',
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    rawPayload: JSON.stringify(raw),
    observedAt: new Date('2026-08-31T00:00:00Z'),
  };
}

describe('canonical opportunity identity evidence', () => {
  it('canonicalizes tracking, query order, scheme, host case, and fragments', () => {
    expect(
      normalizeCanonicalJobUrl(
        'http://WWW.Careers.Acme.test/jobs/42/?b=2&utm_source=x&a=1#apply',
      ),
    ).toBe('https://careers.acme.test/jobs/42?a=1&b=2');
  });

  it('uses an employer-hosted application URL as strong evidence', () => {
    expect(
      deriveOpportunityIdentityEvidence(
        source({ applicationUrl: 'https://careers.acme.test/jobs/42?gclid=x' }),
        normalized,
      )[0],
    ).toEqual({
      kind: 'canonical-application-url',
      key: 'url:https://careers.acme.test/jobs/42',
    });
  });

  it('does not treat provider-hosted URLs or source-local ids as cross-source keys', () => {
    expect(
      deriveOpportunityIdentityEvidence(source({ id: '123' }), normalized),
    ).toEqual([]);
  });

  it('derives employer plus explicit requisition evidence without title equality', () => {
    expect(
      deriveOpportunityIdentityEvidence(
        source({ employerDomain: 'acme.test', requisitionId: ' REQ 42 ' }),
        normalized,
      ),
    ).toContainEqual({
      kind: 'employer-requisition',
      key: 'requisition:acme.test:req-42',
    });
  });

  it('rejects unsafe and malformed URLs', () => {
    expect(normalizeCanonicalJobUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCanonicalJobUrl('not a URL')).toBeNull();
  });
});
