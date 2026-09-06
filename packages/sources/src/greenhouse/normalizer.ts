import { createHash } from 'node:crypto';
import type {
  SourceOpportunity,
  NormalizedOpportunity,
  OpportunityNormalizer,
} from '../core/index.js';
import {
  buildListingDocument,
  fragmentsFromHtml,
  htmlToPlainText,
  type ListingFragmentInput,
} from '../core/listing-document.js';

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
      departments?: Array<{ name?: string }>;
      offices?: Array<{ name?: string; location?: string }>;
      metadata?: Array<{ name?: string; value?: unknown }>;
    };

    // Deterministic extraction
    const title = payload.title?.trim() ?? 'Unknown Title';
    const organization = payload.company_name?.trim() ?? 'Unknown Organization';
    const content = htmlToPlainText(payload.content?.trim() ?? '');
    const location = payload.location?.name?.trim();
    const fragments: ListingFragmentInput[] = fragmentsFromHtml({
      html: payload.content ?? '',
      sourceFieldPath: '$.content',
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
    if (location) {
      fragments.push({
        kind: 'LOCATION',
        heading: 'Location',
        text: location,
        sourceFieldPath: '$.location.name',
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: location },
      });
    }
    const departments = Array.isArray(payload.departments)
      ? payload.departments
      : [];
    for (const [index, department] of departments.entries()) {
      if (!department || typeof department !== 'object') continue;
      const name = department.name?.trim();
      if (!name) continue;
      fragments.push({
        kind: 'OTHER',
        heading: 'Department',
        text: name,
        sourceFieldPath: `$.departments[${index}].name`,
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: name },
      });
    }
    const offices = Array.isArray(payload.offices) ? payload.offices : [];
    for (const [index, office] of offices.entries()) {
      if (!office || typeof office !== 'object') continue;
      const name = office.name?.trim();
      if (name) {
        fragments.push({
          kind: 'OTHER',
          heading: 'Office',
          text: name,
          sourceFieldPath: `$.offices[${index}].name`,
          structure: 'STRUCTURED_VALUE',
          structuredValue: { type: 'STRING', value: name },
        });
      }
      const officeLocation = office.location?.trim();
      if (officeLocation) {
        fragments.push({
          kind: 'LOCATION',
          heading: 'Office location',
          text: officeLocation,
          sourceFieldPath: `$.offices[${index}].location`,
          structure: 'STRUCTURED_VALUE',
          structuredValue: { type: 'STRING', value: officeLocation },
        });
      }
    }
    const metadataEntries = Array.isArray(payload.metadata)
      ? payload.metadata
      : [];
    for (const [index, metadata] of metadataEntries.entries()) {
      if (typeof metadata.value !== 'string' || !metadata.value.trim())
        continue;
      fragments.push({
        kind: 'OTHER',
        ...(metadata.name ? { heading: metadata.name } : {}),
        text: metadata.value,
        sourceFieldPath: `$.metadata[${index}].value`,
        structure: 'STRUCTURED_VALUE',
        structuredValue: { type: 'STRING', value: metadata.value },
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
