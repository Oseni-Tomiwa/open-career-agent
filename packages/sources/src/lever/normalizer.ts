import { createHash } from 'node:crypto';
import type {
  NormalizedOpportunity,
  OpportunityNormalizer,
  SourceOpportunity,
} from '../core/index.js';

export class LeverNormalizer implements OpportunityNormalizer {
  public normalize(record: SourceOpportunity): NormalizedOpportunity {
    if (record.sourceSystem !== 'lever') {
      throw new Error(
        `Unsupported source system for LeverNormalizer: ${record.sourceSystem}`,
      );
    }

    const payload = JSON.parse(record.rawPayload) as {
      text?: string;
      descriptionPlain?: string;
      description?: string;
      categories?: {
        location?: string;
        commitment?: string;
        team?: string;
        department?: string;
      };
      workplaceType?: string;
      _siteId?: string;
    };

    const title = payload.text?.trim() ?? 'Unknown Title';
    const organization =
      payload.categories?.team?.trim() ||
      payload.categories?.department?.trim() ||
      payload._siteId?.trim() ||
      'Unknown Organization';

    const content = (
      payload.descriptionPlain ??
      payload.description ??
      ''
    ).trim();

    const location = payload.categories?.location?.trim();

    let workModel: string | undefined;
    if (payload.workplaceType) {
      const wt = payload.workplaceType.toLowerCase();
      if (wt.includes('remote')) workModel = 'remote';
      else if (wt.includes('hybrid')) workModel = 'hybrid';
      else if (wt.includes('onsite') || wt.includes('on-site'))
        workModel = 'onsite';
    }

    let employmentType: string | undefined;
    if (payload.categories?.commitment) {
      const comm = payload.categories.commitment.toLowerCase();
      if (comm.includes('full')) employmentType = 'full-time';
      else if (comm.includes('contract')) employmentType = 'contract';
      else if (comm.includes('intern')) employmentType = 'internship';
    }

    const result: NormalizedOpportunity = {
      title,
      organization,
      content,
    };

    if (location) result.location = location;
    if (workModel) result.workModel = workModel;
    if (employmentType) result.employmentType = employmentType;

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
