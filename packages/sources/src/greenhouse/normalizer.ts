import { createHash } from 'node:crypto';
import type {
  SourceOpportunity,
  NormalizedOpportunity,
  OpportunityNormalizer,
} from '../core/index.js';

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
    const content = payload.content?.trim() ?? '';
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
