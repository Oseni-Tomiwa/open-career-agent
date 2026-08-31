import { createHash } from 'node:crypto';
import type {
  SourceOpportunity,
  NormalizedOpportunity,
  OpportunityNormalizer,
} from '../core/index.js';

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
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
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return namedEntities[entity.toLowerCase()] ?? match;
    },
  );
}

function htmlToPlainText(value: string): string {
  const decoded = decodeHtmlEntities(value);

  return decodeHtmlEntities(
    decoded
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|h[1-6]|li|ol|p|section|ul)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class GreenhouseNormalizer implements OpportunityNormalizer {
  public normalize(record: SourceOpportunity): NormalizedOpportunity {
    if (record.sourceSystem !== 'greenhouse') {
      throw new Error(
        `Unsupported source system for GreenhouseNormalizer: ${record.sourceSystem}`,
      );
    }

    const payload = JSON.parse(record.rawPayload) as {
      title?: string;
      company_name?: string;
      content?: string;
      location?: { name?: string };
    };

    // Deterministic extraction
    const title = payload.title?.trim() ?? 'Unknown Title';
    const organization = payload.company_name?.trim() ?? 'Unknown Organization';
    const content = htmlToPlainText(payload.content?.trim() ?? '');
    const location = payload.location?.name?.trim();

    const result: NormalizedOpportunity = {
      title,
      organization,
      content,
    };
    if (location) {
      result.location = location;
    }
    return result;
  }

  public hash(normalized: NormalizedOpportunity): string {
    const data = JSON.stringify({
      title: normalized.title,
      organization: normalized.organization,
      content: normalized.content,
      location: normalized.location,
      workModel: normalized.workModel,
      employmentType: normalized.employmentType,
      compensation: normalized.compensation,
    });

    return createHash('sha256').update(data).digest('hex');
  }
}
