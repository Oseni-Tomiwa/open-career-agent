import { createHash } from 'node:crypto';
import type {
  NormalizedOpportunity,
  OpportunityNormalizer,
  SourceOpportunity,
} from '../core/index.js';

export class AshbyNormalizer implements OpportunityNormalizer {
  public normalize(record: SourceOpportunity): NormalizedOpportunity {
    if (record.sourceSystem !== 'ashby') {
      throw new Error(
        `Unsupported source system for AshbyNormalizer: ${record.sourceSystem}`,
      );
    }

    const payload = JSON.parse(record.rawPayload) as {
      title?: string;
      department?: string;
      locationName?: string;
      employmentType?: string;
      workplaceType?: string;
      isRemote?: boolean;
      descriptionPlain?: string;
      descriptionHtml?: string;
      _boardId?: string;
    };

    const title = payload.title?.trim() ?? 'Unknown Title';
    // Ashby's public job-board payload exposes department/team metadata but
    // not a separate employer field. The board identifier supplied by the
    // adapter is therefore the authoritative organization context.
    const organization =
      payload._boardId?.trim() ||
      payload.department?.trim() ||
      'Unknown Organization';

    const content = (
      payload.descriptionPlain ??
      payload.descriptionHtml ??
      ''
    ).trim();

    const location = payload.locationName?.trim();

    let workModel: string | undefined;
    if (payload.workplaceType) {
      const wt = payload.workplaceType.toLowerCase();
      if (wt.includes('remote')) workModel = 'remote';
      else if (wt.includes('hybrid')) workModel = 'hybrid';
      else if (wt.includes('onsite') || wt.includes('on-site'))
        workModel = 'onsite';
    } else if (payload.isRemote) {
      workModel = 'remote';
    }

    let employmentType: string | undefined;
    if (payload.employmentType) {
      const emp = payload.employmentType.toLowerCase();
      if (emp.includes('full')) employmentType = 'full-time';
      else if (emp.includes('contract')) employmentType = 'contract';
      else if (emp.includes('intern')) employmentType = 'internship';
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
