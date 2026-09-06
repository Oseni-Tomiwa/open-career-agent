import { createHash } from 'node:crypto';
import type {
  NormalizedOpportunity,
  OpportunityNormalizer,
  SourceOpportunity,
} from '../core/index.js';
import {
  buildListingDocument,
  fragmentsFromHtml,
  fragmentsFromPlainText,
  type ListingFragmentInput,
} from '../core/listing-document.js';

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
      team?: string;
      locationName?: string;
      secondaryLocations?: Array<
        string | { locationName?: string; name?: string }
      >;
      employmentType?: string;
      workplaceType?: string;
      isRemote?: boolean;
      descriptionPlain?: string;
      descriptionHtml?: string;
      compensation?: string | { compensationTierSummary?: string };
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

    const fragments: ListingFragmentInput[] = payload.descriptionHtml
      ? fragmentsFromHtml({
          html: payload.descriptionHtml,
          sourceFieldPath: '$.descriptionHtml',
          defaultKind: 'SUMMARY',
        })
      : fragmentsFromPlainText({
          text: payload.descriptionPlain ?? '',
          sourceFieldPath: '$.descriptionPlain',
          defaultKind: 'SUMMARY',
        });
    fragments.unshift({
      kind: 'OTHER',
      heading: 'Job title',
      text: title,
      sourceFieldPath: '$.title',
      structure: 'STRUCTURED_VALUE',
      structuredValue: { type: 'STRING', value: title },
    });

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

    const secondaryLocations = (
      Array.isArray(payload.secondaryLocations)
        ? payload.secondaryLocations
        : []
    ).flatMap((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        return [
          {
            text: item.trim(),
            path: `$.secondaryLocations[${index}]`,
          },
        ];
      }
      if (!item || typeof item !== 'object') return [];
      if (item.locationName?.trim()) {
        return [
          {
            text: item.locationName.trim(),
            path: `$.secondaryLocations[${index}].locationName`,
          },
        ];
      }
      return item.name?.trim()
        ? [
            {
              text: item.name.trim(),
              path: `$.secondaryLocations[${index}].name`,
            },
          ]
        : [];
    });
    if (location) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Location',
        text: location,
        sourceFieldPath: '$.locationName',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: location },
      });
    }
    for (const secondaryLocation of secondaryLocations) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Secondary location',
        text: secondaryLocation.text,
        sourceFieldPath: secondaryLocation.path,
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: secondaryLocation.text },
      });
    }
    for (const [heading, value, path] of [
      ['Department', payload.department, '$.department'],
      ['Team', payload.team, '$.team'],
    ] as const) {
      if (!value?.trim()) continue;
      fragments.push({
        kind: 'OTHER',
        heading,
        text: value.trim(),
        sourceFieldPath: path,
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: value.trim() },
      });
    }
    if (payload.workplaceType) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Workplace type',
        text: payload.workplaceType,
        sourceFieldPath: '$.workplaceType',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: payload.workplaceType },
      });
    }
    if (payload.employmentType) {
      fragments.push({
        kind: 'EMPLOYMENT',
        heading: 'Employment type',
        text: payload.employmentType,
        sourceFieldPath: '$.employmentType',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: payload.employmentType },
      });
    }
    const compensation =
      typeof payload.compensation === 'string'
        ? payload.compensation.trim()
        : payload.compensation?.compensationTierSummary?.trim();
    if (compensation) {
      fragments.push({
        kind: 'COMPENSATION',
        heading: 'Compensation',
        text: compensation,
        sourceFieldPath: '$.compensation',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: compensation },
      });
    }

    const result: NormalizedOpportunity = {
      title,
      organization,
      content,
      document: buildListingDocument({
        sourceSystem: record.sourceSystem,
        sourceExternalId: record.sourceExternalId,
        ...(record.sourceUrl ? { sourceUrl: record.sourceUrl } : {}),
        fragments,
      }),
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
