import { createHash } from 'node:crypto';

export const NORMALIZED_LISTING_DOCUMENT_VERSION = 'listing-document-v2.2';
export const MAX_LISTING_FRAGMENTS = 128;
export const MAX_LISTING_FRAGMENT_LENGTH = 8_000;

export const LISTING_SECTION_KINDS = [
  'SUMMARY',
  'RESPONSIBILITIES',
  'REQUIREMENTS',
  'PREFERRED_QUALIFICATIONS',
  'SKILLS',
  'BENEFITS',
  'COMPENSATION',
  'LOCATION',
  'EMPLOYMENT',
  'OTHER',
] as const;

export type ListingSectionKind = (typeof LISTING_SECTION_KINDS)[number];
export type ListingFragmentStructure =
  'PROSE' | 'LIST_ITEM' | 'STRUCTURED_VALUE';

export interface NormalizedListingFragment {
  readonly id: string;
  readonly kind: ListingSectionKind;
  readonly heading?: string;
  readonly text: string;
  readonly sourceSystem: string;
  readonly sourceFieldPath: string;
  readonly order: number;
  readonly structure: ListingFragmentStructure;
  readonly structuredValue?:
    | { readonly type: 'STRING'; readonly value: string }
    | { readonly type: 'STRING_LIST'; readonly values: readonly string[] };
  readonly truncated: boolean;
}

export interface NormalizedListingDocument {
  readonly version: typeof NORMALIZED_LISTING_DOCUMENT_VERSION;
  readonly sourceSystem: string;
  readonly sourceExternalId: string;
  readonly sourceUrl?: string;
  readonly fragments: readonly NormalizedListingFragment[];
  readonly truncated: boolean;
  readonly discardedFragmentCount: number;
}

export interface ListingFragmentInput {
  readonly kind?: ListingSectionKind;
  readonly heading?: string;
  readonly text: string;
  readonly sourceFieldPath: string;
  readonly structure?: ListingFragmentStructure;
  readonly structuredValue?: NormalizedListingFragment['structuredValue'];
}

const PRIORITY: Record<ListingSectionKind, number> = {
  REQUIREMENTS: 0,
  PREFERRED_QUALIFICATIONS: 0,
  SKILLS: 1,
  LOCATION: 1,
  EMPLOYMENT: 1,
  COMPENSATION: 1,
  RESPONSIBILITIES: 2,
  SUMMARY: 3,
  OTHER: 4,
  BENEFITS: 5,
};

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeListingText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : '';
}

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (match, entity: string) => {
      if (/^#x/i.test(entity)) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return named[entity.toLowerCase()] ?? match;
    },
  );
}

export function htmlToPlainText(value: string): string {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    decoded = decodeHtmlEntities(decoded);
  }
  return normalizeListingText(
    decodeHtmlEntities(
      decoded
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|h[1-6]|li|ol|p|section|ul)>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

export function classifyListingHeading(
  heading: string | undefined,
): ListingSectionKind {
  const value = heading?.toLowerCase().trim() ?? '';
  if (/preferred|nice to have|bonus|plus/.test(value)) {
    return 'PREFERRED_QUALIFICATIONS';
  }
  if (
    /requirement|qualification|what you bring|what we.re looking/.test(value)
  ) {
    return 'REQUIREMENTS';
  }
  if (/responsibilit|what you.ll do|the role|your impact/.test(value)) {
    return 'RESPONSIBILITIES';
  }
  if (/skill|technology|tech stack/.test(value)) return 'SKILLS';
  if (/benefit|perks|what we offer/.test(value)) return 'BENEFITS';
  if (/compensation|salary|pay range/.test(value)) return 'COMPENSATION';
  if (/location|where you.ll work|workplace/.test(value)) return 'LOCATION';
  if (/employment|commitment|job type/.test(value)) return 'EMPLOYMENT';
  if (/summary|about the (?:job|role)|overview|opening/.test(value)) {
    return 'SUMMARY';
  }
  return 'OTHER';
}

function splitProse(value: string): string[] {
  const text = normalizeListingText(value);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function fragmentsFromHtml(input: {
  readonly html: string;
  readonly sourceFieldPath: string;
  readonly defaultKind?: ListingSectionKind;
  readonly heading?: string;
}): ListingFragmentInput[] {
  let decoded = input.html;
  for (let index = 0; index < 2; index += 1) {
    decoded = decodeHtmlEntities(decoded);
  }
  const fragments: ListingFragmentInput[] = [];
  let heading = input.heading;
  let kind = input.defaultKind ?? classifyListingHeading(heading);
  const tokenPattern = /<(h[1-6]|li|p)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(decoded)) !== null) {
    const tag = match[1]!.toLowerCase();
    const text = htmlToPlainText(match[2] ?? '');
    if (!text) continue;
    if (tag.startsWith('h')) {
      heading = text;
      kind = classifyListingHeading(text);
      continue;
    }
    for (const sentence of tag === 'li' ? [text] : splitProse(text)) {
      fragments.push({
        kind,
        ...(heading ? { heading } : {}),
        text: sentence,
        sourceFieldPath: input.sourceFieldPath,
        structure: tag === 'li' ? 'LIST_ITEM' : 'PROSE',
      });
    }
  }
  if (fragments.length === 0) {
    const text = htmlToPlainText(decoded);
    if (text) {
      fragments.push({
        kind,
        ...(heading ? { heading } : {}),
        text,
        sourceFieldPath: input.sourceFieldPath,
        structure: 'PROSE',
      });
    }
  }
  return fragments;
}

export function fragmentsFromPlainText(input: {
  readonly text: string;
  readonly sourceFieldPath: string;
  readonly defaultKind?: ListingSectionKind;
  readonly heading?: string;
}): ListingFragmentInput[] {
  const normalized = normalizeListingText(input.text);
  if (!normalized) return [];
  const fragments: ListingFragmentInput[] = [];
  let heading = input.heading;
  let kind = input.defaultKind ?? classifyListingHeading(heading);
  for (const rawPart of normalized.split(/\n{2,}|\n(?=[•*-]\s+)/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const headingMatch = /^([^\n:]{2,80}):\s*$/.exec(part);
    if (headingMatch) {
      heading = headingMatch[1]!.trim();
      kind = classifyListingHeading(heading);
      continue;
    }
    const listItem = /^[•*-]\s+/.test(part);
    const text = part.replace(/^[•*-]\s+/, '');
    for (const sentence of listItem ? [text] : splitProse(text)) {
      fragments.push({
        kind,
        ...(heading ? { heading } : {}),
        text: sentence,
        sourceFieldPath: input.sourceFieldPath,
        structure: listItem ? 'LIST_ITEM' : 'PROSE',
      });
    }
  }
  return fragments;
}

export function buildListingDocument(input: {
  readonly sourceSystem: string;
  readonly sourceExternalId: string;
  readonly sourceUrl?: string;
  readonly fragments: readonly ListingFragmentInput[];
}): NormalizedListingDocument {
  const candidates = input.fragments
    .map((fragment, sourceOrder) => ({ fragment, sourceOrder }))
    .filter(({ fragment }) => normalizeListingText(fragment.text));
  const seen = new Set<string>();
  const deduplicated = [...candidates]
    .sort(
      (left, right) =>
        PRIORITY[left.fragment.kind ?? 'OTHER'] -
          PRIORITY[right.fragment.kind ?? 'OTHER'] ||
        left.sourceOrder - right.sourceOrder,
    )
    .filter(({ fragment }) => {
      const key = normalizeListingText(fragment.text).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const retained = deduplicated
    .slice(0, MAX_LISTING_FRAGMENTS)
    .sort((left, right) => left.sourceOrder - right.sourceOrder);

  const fragments = retained.map(({ fragment, sourceOrder }, order) => {
    const originalText = normalizeListingText(fragment.text);
    const text = originalText.slice(0, MAX_LISTING_FRAGMENT_LENGTH).trim();
    const kind = fragment.kind ?? 'OTHER';
    const id = `fragment_${hash(
      JSON.stringify([
        NORMALIZED_LISTING_DOCUMENT_VERSION,
        input.sourceSystem,
        input.sourceExternalId,
        fragment.sourceFieldPath,
        sourceOrder,
        text,
      ]),
    ).slice(0, 32)}`;
    return {
      id,
      kind,
      ...(fragment.heading ? { heading: fragment.heading } : {}),
      text,
      sourceSystem: input.sourceSystem,
      sourceFieldPath: fragment.sourceFieldPath,
      order,
      structure: fragment.structure ?? 'PROSE',
      ...(fragment.structuredValue
        ? { structuredValue: fragment.structuredValue }
        : {}),
      truncated: originalText.length > text.length,
    } satisfies NormalizedListingFragment;
  });

  return {
    version: NORMALIZED_LISTING_DOCUMENT_VERSION,
    sourceSystem: input.sourceSystem,
    sourceExternalId: input.sourceExternalId,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    fragments,
    truncated:
      deduplicated.length > retained.length ||
      fragments.some((fragment) => fragment.truncated),
    discardedFragmentCount: Math.max(0, deduplicated.length - retained.length),
  };
}
