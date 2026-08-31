import type { NormalizedOpportunity, SourceOpportunity } from './index.js';

export type OpportunityIdentityKind =
  'canonical-application-url' | 'employer-requisition';

export interface OpportunityIdentityEvidence {
  readonly kind: OpportunityIdentityKind;
  readonly key: string;
}

const TRACKING_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'msclkid',
]);

const ATS_HOST_SUFFIXES = ['greenhouse.io', 'lever.co', 'ashbyhq.com'];

const URL_FIELDS = [
  'applicationUrl',
  'application_url',
  'applyUrl',
  'apply_url',
  'externalApplyUrl',
  'external_apply_url',
  'canonicalUrl',
  'canonical_url',
  'jobUrl',
  'job_url',
] as const;

const REQUISITION_FIELDS = [
  'requisitionId',
  'requisition_id',
  'requisitionCode',
  'requisition_code',
  'jobRequisitionId',
  'job_requisition_id',
] as const;

const EMPLOYER_DOMAIN_FIELDS = [
  'employerDomain',
  'employer_domain',
  'companyDomain',
  'company_domain',
] as const;

function normalizedToken(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
  return normalized || null;
}

function findFirstField(
  value: unknown,
  fieldNames: readonly string[],
  depth = 0,
): unknown {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const record = value as Record<string, unknown>;
  for (const fieldName of fieldNames) {
    if (record[fieldName] !== undefined && record[fieldName] !== null) {
      return record[fieldName];
    }
  }
  for (const child of Object.values(record)) {
    const found = findFirstField(child, fieldNames, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function normalizeCanonicalJobUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith('utm_') ||
        TRACKING_PARAMETERS.has(key.toLowerCase())
      ) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    parsed.pathname =
      parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return parsed.toString();
  } catch {
    return null;
  }
}

function isEmployerHostedUrl(value: string): boolean {
  const host = new URL(value).hostname;
  return !ATS_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function normalizeRoleIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeLocationIdentity(value?: string): string | null {
  return value ? normalizeRoleIdentity(value) || null : null;
}

export function deriveOpportunityIdentityEvidence(
  source: SourceOpportunity,
  normalized: NormalizedOpportunity,
): readonly OpportunityIdentityEvidence[] {
  let payload: unknown = {};
  try {
    payload = JSON.parse(source.rawPayload) as unknown;
  } catch {
    // Malformed payloads are rejected by normalizers; identity simply has no raw hints.
  }

  const rawUrl = findFirstField(payload, URL_FIELDS) ?? source.sourceUrl;
  const canonicalUrl = normalizeCanonicalJobUrl(rawUrl);
  const evidence: OpportunityIdentityEvidence[] = [];
  if (canonicalUrl && isEmployerHostedUrl(canonicalUrl)) {
    evidence.push({
      kind: 'canonical-application-url',
      key: `url:${canonicalUrl}`,
    });
  }

  const requisition = normalizedToken(
    findFirstField(payload, REQUISITION_FIELDS),
  );
  const configuredDomain = findFirstField(payload, EMPLOYER_DOMAIN_FIELDS);
  const employerUrl = normalizeCanonicalJobUrl(
    typeof configuredDomain === 'string' && !configuredDomain.includes('://')
      ? `https://${configuredDomain}`
      : configuredDomain,
  );
  const employerHost =
    employerUrl && isEmployerHostedUrl(employerUrl)
      ? new URL(employerUrl).hostname
      : canonicalUrl && isEmployerHostedUrl(canonicalUrl)
        ? new URL(canonicalUrl).hostname
        : null;
  if (employerHost && requisition) {
    evidence.push({
      kind: 'employer-requisition',
      key: `requisition:${employerHost}:${requisition}`,
    });
  }

  // Role and location intentionally are not keys. They are passed to the
  // resolver as collision guards for otherwise-strong evidence.
  void normalized;
  return evidence;
}
