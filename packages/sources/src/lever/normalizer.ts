import { createHash } from 'node:crypto';
import type {
  NormalizedOpportunity,
  OpportunityNormalizer,
  SourceOpportunity,
} from '../core/index.js';
import {
  buildListingDocument,
  classifyListingHeading,
  fragmentsFromHtml,
  fragmentsFromPlainText,
  type ListingFragmentInput,
} from '../core/listing-document.js';

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
      openingPlain?: string;
      opening?: string;
      descriptionBodyPlain?: string;
      descriptionBody?: string;
      additionalPlain?: string;
      additional?: string;
      lists?: Array<{ text?: string; content?: string }>;
      country?: string;
      categories?: {
        location?: string;
        allLocations?: Array<string | { name?: string }>;
        commitment?: string;
        team?: string;
        department?: string;
      };
      workplaceType?: string;
      salaryRange?: {
        min?: number;
        max?: number;
        currency?: string;
        interval?: string;
      };
      _siteId?: string;
    };

    const title = payload.text?.trim() ?? 'Unknown Title';
    // Lever's team and department describe the role, not its employer. The
    // adapter-provided site identifier is the authoritative organization
    // context available from the public postings API.
    const organization =
      payload._siteId?.trim() ||
      payload.categories?.department?.trim() ||
      payload.categories?.team?.trim() ||
      'Unknown Organization';

    const content = (
      payload.descriptionPlain ??
      payload.description ??
      ''
    ).trim();

    const fragments: ListingFragmentInput[] = [];
    fragments.push({
      kind: 'OTHER',
      heading: 'Job title',
      text: title,
      sourceFieldPath: '$.text',
      structure: 'STRUCTURED_VALUE',
      structuredValue: { type: 'STRING', value: title },
    });
    const lists = Array.isArray(payload.lists) ? payload.lists : [];
    const hasRichBody = Boolean(
      payload.openingPlain ||
      payload.opening ||
      payload.descriptionBodyPlain ||
      payload.descriptionBody ||
      lists.length ||
      payload.additionalPlain ||
      payload.additional,
    );
    if (payload.openingPlain || payload.opening) {
      const value = payload.openingPlain ?? payload.opening ?? '';
      fragments.push(
        ...(payload.openingPlain
          ? fragmentsFromPlainText({
              text: value,
              sourceFieldPath: '$.openingPlain',
              defaultKind: 'SUMMARY',
              heading: 'Opening',
            })
          : fragmentsFromHtml({
              html: value,
              sourceFieldPath: '$.opening',
              defaultKind: 'SUMMARY',
              heading: 'Opening',
            })),
      );
    }
    if (payload.descriptionBodyPlain || payload.descriptionBody) {
      const value =
        payload.descriptionBodyPlain ?? payload.descriptionBody ?? '';
      fragments.push(
        ...(payload.descriptionBodyPlain
          ? fragmentsFromPlainText({
              text: value,
              sourceFieldPath: '$.descriptionBodyPlain',
              defaultKind: 'SUMMARY',
            })
          : fragmentsFromHtml({
              html: value,
              sourceFieldPath: '$.descriptionBody',
              defaultKind: 'SUMMARY',
            })),
      );
    }
    for (const [index, list] of lists.entries()) {
      const heading = list.text?.trim();
      const path = `$.lists[${index}].content`;
      fragments.push(
        ...fragmentsFromHtml({
          html: list.content ?? '',
          sourceFieldPath: path,
          ...(heading ? { heading } : {}),
          defaultKind: classifyListingHeading(heading),
        }).map((fragment) => ({
          ...fragment,
          structure: 'LIST_ITEM' as const,
        })),
      );
    }
    if (payload.additionalPlain || payload.additional) {
      const value = payload.additionalPlain ?? payload.additional ?? '';
      fragments.push(
        ...(payload.additionalPlain
          ? fragmentsFromPlainText({
              text: value,
              sourceFieldPath: '$.additionalPlain',
              defaultKind: 'OTHER',
            })
          : fragmentsFromHtml({
              html: value,
              sourceFieldPath: '$.additional',
              defaultKind: 'OTHER',
            })),
      );
    }
    if (!hasRichBody) {
      fragments.push(
        ...(payload.descriptionPlain
          ? fragmentsFromPlainText({
              text: payload.descriptionPlain,
              sourceFieldPath: '$.descriptionPlain',
              defaultKind: 'SUMMARY',
            })
          : fragmentsFromHtml({
              html: payload.description ?? '',
              sourceFieldPath: '$.description',
              defaultKind: 'SUMMARY',
            })),
      );
    }

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

    if (location) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Location',
        text: location,
        sourceFieldPath: '$.categories.location',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: location },
      });
    }
    for (const [heading, value, path] of [
      ['Department', payload.categories?.department, '$.categories.department'],
      ['Team', payload.categories?.team, '$.categories.team'],
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
    const allLocations = Array.isArray(payload.categories?.allLocations)
      ? payload.categories.allLocations
          .map((item) =>
            typeof item === 'string' ? item.trim() : (item.name ?? '').trim(),
          )
          .filter(Boolean)
      : [];
    if (allLocations.length > 0) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'All locations',
        text: [...new Set(allLocations)].join('; '),
        sourceFieldPath: '$.categories.allLocations',
        structure: 'STRUCTURED_VALUE',
        structuredValue: {
          type: 'STRING_LIST',
          values: [...new Set(allLocations)],
        },
      });
    }
    if (payload.country?.trim()) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Country',
        text: payload.country.trim(),
        sourceFieldPath: '$.country',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: payload.country.trim() },
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
    if (payload.categories?.commitment) {
      fragments.push({
        kind: 'EMPLOYMENT',
        heading: 'Commitment',
        text: payload.categories.commitment,
        sourceFieldPath: '$.categories.commitment',
        structure: 'STRUCTURED_VALUE',
        structuredValue: {
          type: 'STRING',
          value: payload.categories.commitment,
        },
      });
    }
    const salary = payload.salaryRange;
    const compensation = salary
      ? [
          salary.currency,
          salary.min,
          salary.max !== undefined ? `–${salary.max}` : undefined,
          salary.interval ? `per ${salary.interval}` : undefined,
        ]
          .filter((value) => value !== undefined && value !== '')
          .join(' ')
      : undefined;
    if (compensation) {
      fragments.push({
        kind: 'COMPENSATION',
        heading: 'Compensation',
        text: compensation,
        sourceFieldPath: '$.salaryRange',
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
