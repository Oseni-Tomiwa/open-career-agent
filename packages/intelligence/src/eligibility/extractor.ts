export interface EligibilityConstraint {
  dimension: string; // e.g. 'sponsorship', 'work_authorization', 'location', 'education'
  requirement: string;
  modality: 'mandatory' | 'preferred' | 'ambiguous';
  scope: string;
  sourceText: string;
  extractionMethod: string;
}

export class EligibilityConstraintExtractor {
  extract(snapshot: {
    content?: string | null;
    location?: string | null;
    workModel?: string | null;
  }): EligibilityConstraint[] {
    const constraints: EligibilityConstraint[] = [];
    const content = (snapshot.content || '').toLowerCase();

    // SPONSORSHIP
    if (
      content.includes('we are unable to sponsor') ||
      content.includes('no sponsorship available') ||
      content.includes('cannot provide sponsorship')
    ) {
      constraints.push({
        dimension: 'sponsorship',
        requirement: 'requires candidate to not need sponsorship',
        modality: 'mandatory',
        scope: 'employment',
        sourceText: 'We are unable to sponsor...', // Simplified for now
        extractionMethod: 'deterministic_regex',
      });
    } else if (
      content.includes('visa sponsorship available') ||
      content.includes('will sponsor')
    ) {
      constraints.push({
        dimension: 'sponsorship',
        requirement: 'sponsorship is available',
        modality: 'mandatory',
        scope: 'employment',
        sourceText: 'Visa sponsorship available...',
        extractionMethod: 'deterministic_regex',
      });
    }

    // WORK AUTHORIZATION
    if (content.match(/must be authorized to work in the (us|united states)/)) {
      constraints.push({
        dimension: 'work_authorization',
        requirement: 'US work authorization',
        modality: 'mandatory',
        scope: 'us',
        sourceText: 'Must be authorized to work in the US',
        extractionMethod: 'deterministic_regex',
      });
    }

    // CITIZENSHIP
    if (content.match(/us citizenship required/)) {
      constraints.push({
        dimension: 'citizenship',
        requirement: 'US Citizenship',
        modality: 'mandatory',
        scope: 'us',
        sourceText: 'US citizenship required',
        extractionMethod: 'deterministic_regex',
      });
    }

    // EDUCATION
    if (content.includes('currently enrolled undergraduate students only')) {
      constraints.push({
        dimension: 'current_student',
        requirement: 'Undergraduate student',
        modality: 'mandatory',
        scope: 'enrollment',
        sourceText: 'currently enrolled undergraduate students only',
        extractionMethod: 'deterministic_regex',
      });
    }

    // GEOGRAPHY
    if (snapshot.location) {
      if (
        snapshot.location.toLowerCase() === 'worldwide remote' ||
        snapshot.location.toLowerCase() === 'remote - anywhere'
      ) {
        // No constraint
      } else if (
        snapshot.workModel?.toLowerCase() === 'remote' &&
        snapshot.location
      ) {
        // e.g. Germany remote
        constraints.push({
          dimension: 'location',
          requirement: `Must be located in ${snapshot.location}`,
          modality: 'mandatory',
          scope: snapshot.location,
          sourceText: snapshot.content
            ? snapshot.content
            : `Remote within ${snapshot.location}`,
          extractionMethod: 'structured_field',
        });
      }
    }

    if (/active (top secret|ts\/sci|secret|q|l) clearance/i.test(content)) {
      constraints.push({
        dimension: 'clearance',
        modality: 'mandatory',
        scope:
          content
            .match(/active (top secret|ts\/sci|secret|q|l) clearance/i)?.[1]
            ?.toLowerCase()
            .replace('/', '') ?? '',
        requirement: 'active clearance',
        sourceText:
          content.match(
            /active (top secret|ts\/sci|secret|q|l) clearance/i,
          )?.[0] ?? '',
        extractionMethod: 'regex',
      });
    }

    if (
      /(must be fluent in|fluency in) (spanish|french|german|mandarin|japanese)/i.test(
        content,
      )
    ) {
      constraints.push({
        dimension: 'language',
        modality: 'mandatory',
        scope:
          content
            .match(
              /(must be fluent in|fluency in) (spanish|french|german|mandarin|japanese)/i,
            )?.[2]
            ?.toLowerCase() ?? '',
        requirement: 'language fluency',
        sourceText:
          content.match(
            /(must be fluent in|fluency in) (spanish|french|german|mandarin|japanese)/i,
          )?.[0] ?? '',
        extractionMethod: 'regex',
      });
    }
    if (
      /(spanish|french|german|mandarin|japanese) is a plus|(spanish|french|german|mandarin|japanese) preferred/i.test(
        content,
      )
    ) {
      constraints.push({
        dimension: 'language',
        modality: 'preferred',
        scope:
          content
            .match(
              /(spanish|french|german|mandarin|japanese) is a plus|(spanish|french|german|mandarin|japanese) preferred/i,
            )?.[1]
            ?.toLowerCase() ??
          content
            .match(
              /(spanish|french|german|mandarin|japanese) is a plus|(spanish|french|german|mandarin|japanese) preferred/i,
            )?.[2]
            ?.toLowerCase() ??
          '',
        requirement: 'preferred language',
        sourceText:
          content.match(
            /(spanish|french|german|mandarin|japanese) is a plus|(spanish|french|german|mandarin|japanese) preferred/i,
          )?.[0] ?? '',
        extractionMethod: 'regex',
      });
    }
    return constraints;
  }
}
