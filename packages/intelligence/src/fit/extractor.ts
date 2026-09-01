export const FIT_DIMENSIONS = [
  'technical_skill',
  'tool_platform',
  'programming_language',
  'specialization',
  'experience_depth',
  'seniority',
  'domain',
  'project_relevance',
  'architecture',
  'cloud_devops',
  'data_database',
] as const;

export type FitDimension = (typeof FIT_DIMENSIONS)[number];
export type FitModality = 'required' | 'preferred' | 'optional';

export interface FitRequirement {
  readonly id: string;
  readonly dimension: FitDimension;
  readonly normalizedValue: string;
  readonly label: string;
  readonly modality: FitModality;
  readonly sourceText: string;
  readonly sourceReference: string;
  readonly extractionConfidence: 'high' | 'medium';
  readonly minimumYears?: number;
}

interface TermDefinition {
  readonly value: string;
  readonly dimension: FitDimension;
  readonly aliases: readonly string[];
}

// Deliberately bounded. Additions require a test and an auditable normalization.
const TERMS: readonly TermDefinition[] = [
  {
    value: 'node.js',
    dimension: 'programming_language',
    aliases: ['node.js', 'nodejs', 'node js'],
  },
  {
    value: 'javascript',
    dimension: 'programming_language',
    aliases: ['javascript'],
  },
  {
    value: 'typescript',
    dimension: 'programming_language',
    aliases: ['typescript'],
  },
  { value: 'python', dimension: 'programming_language', aliases: ['python'] },
  { value: 'java', dimension: 'programming_language', aliases: ['java'] },
  { value: 'go', dimension: 'programming_language', aliases: ['go', 'golang'] },
  { value: 'ruby', dimension: 'programming_language', aliases: ['ruby'] },
  {
    value: 'react',
    dimension: 'technical_skill',
    aliases: ['react', 'react.js', 'reactjs'],
  },
  {
    value: 'vue',
    dimension: 'technical_skill',
    aliases: ['vue', 'vue.js', 'vuejs'],
  },
  { value: 'angular', dimension: 'technical_skill', aliases: ['angular'] },
  {
    value: 'express',
    dimension: 'technical_skill',
    aliases: ['express', 'express.js', 'expressjs'],
  },
  { value: 'fastify', dimension: 'technical_skill', aliases: ['fastify'] },
  { value: 'django', dimension: 'technical_skill', aliases: ['django'] },
  {
    value: 'kubernetes',
    dimension: 'cloud_devops',
    aliases: ['kubernetes', 'k8s'],
  },
  {
    value: 'docker',
    dimension: 'cloud_devops',
    aliases: ['docker', 'containerization', 'containerised', 'containerized'],
  },
  {
    value: 'docker',
    dimension: 'technical_skill',
    aliases: ['container', 'containers'],
  },
  { value: 'linux', dimension: 'tool_platform', aliases: ['linux'] },
  {
    value: 'aws',
    dimension: 'cloud_devops',
    aliases: ['aws', 'amazon web services'],
  },
  { value: 'azure', dimension: 'cloud_devops', aliases: ['azure'] },
  { value: 'gcp', dimension: 'cloud_devops', aliases: ['gcp', 'google cloud'] },
  { value: 'terraform', dimension: 'cloud_devops', aliases: ['terraform'] },
  {
    value: 'postgresql',
    dimension: 'data_database',
    aliases: ['postgresql', 'postgres'],
  },
  { value: 'mysql', dimension: 'data_database', aliases: ['mysql'] },
  {
    value: 'mongodb',
    dimension: 'data_database',
    aliases: ['mongodb', 'mongo'],
  },
  { value: 'redis', dimension: 'data_database', aliases: ['redis'] },
  { value: 'sql', dimension: 'data_database', aliases: ['sql'] },
  {
    value: 'distributed systems',
    dimension: 'architecture',
    aliases: ['distributed systems', 'distributed system'],
  },
  {
    value: 'system design',
    dimension: 'architecture',
    aliases: ['system design', 'systems design'],
  },
  {
    value: 'microservices',
    dimension: 'architecture',
    aliases: ['microservices', 'microservice architecture'],
  },
  {
    value: 'backend',
    dimension: 'specialization',
    aliases: ['backend', 'back-end'],
  },
  {
    value: 'frontend',
    dimension: 'specialization',
    aliases: ['frontend', 'front-end'],
  },
  {
    value: 'platform engineering',
    dimension: 'specialization',
    aliases: ['platform engineering', 'platform engineer'],
  },
  { value: 'devops', dimension: 'specialization', aliases: ['devops'] },
  {
    value: 'fintech',
    dimension: 'domain',
    aliases: ['fintech', 'financial services'],
  },
  {
    value: 'healthcare',
    dimension: 'domain',
    aliases: ['healthcare', 'health tech', 'healthtech'],
  },
  {
    value: 'security',
    dimension: 'domain',
    aliases: ['cybersecurity', 'application security', 'security domain'],
  },
  {
    value: 'ecommerce',
    dimension: 'domain',
    aliases: ['ecommerce', 'e-commerce'],
  },
  {
    value: 'developer tooling',
    dimension: 'domain',
    aliases: ['developer tooling', 'developer tools'],
  },
] as const;

const ELIGIBILITY_ONLY =
  /\b(sponsor(?:ship)?|visa|authori[sz]ed to work|work authori[sz]ation|citizen(?:ship)?|clearance|relocat(?:e|ion)|reside|current(?:ly)? enrolled)\b/i;
const REQUIREMENT_CUE =
  /\b(required|requirements?|must|need(?:ed)?|minimum|at least|experience (?:with|in)|proficien(?:t|cy)|knowledge of|familiarity with|you(?:'ll| will)? (?:have|bring)|qualifications?)\b/i;
const PREFERRED_CUE =
  /\b(preferred|ideally|bonus|plus|nice[- ]to[- ]have|advantageous)\b/i;
const OPTIONAL_CUE = /\b(optional|helpful but not required)\b/i;
const NEGATED_REQUIREMENT_CUE =
  /\b(?:do not|don['’]t|does not|doesn['’]t|no)\s+(?:necessarily\s+)?(?:need|require)|\bnot required\b/i;

function plainText(content: string): string {
  return content
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<li\b[^>]*>/gi, '\n')
    .replace(/<\/(?:li|p|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ');
}

function fragments(content: string): string[] {
  return plainText(content)
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((value) => value.replace(/^[-*•]\s*/, '').trim())
    .filter((value) => value.length > 0);
}

function modalityFor(text: string): FitModality {
  if (OPTIONAL_CUE.test(text)) return 'optional';
  if (PREFERRED_CUE.test(text)) return 'preferred';
  return 'required';
}

function includesAlias(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i').test(text);
}

function termMatchesText(term: TermDefinition, text: string): boolean {
  const comparable =
    term.value === 'go' ? text.replace(/\bgo[- ]to[- ]market\b/gi, '') : text;
  return term.aliases.some((alias) => includesAlias(comparable, alias));
}

function requirementId(
  dimension: FitDimension,
  value: string,
  index: number,
): string {
  return `${dimension}:${value.replace(/[^a-z0-9]+/g, '-')}:${index}`;
}

export class FitRequirementExtractor {
  public extract(snapshot: {
    id?: string;
    title?: string | null;
    content?: string | null;
  }): FitRequirement[] {
    const sourceReference = snapshot.id
      ? `snapshot:${snapshot.id}`
      : 'snapshot';
    const output: FitRequirement[] = [];
    const seen = new Set<string>();

    for (const sourceText of fragments(snapshot.content ?? '')) {
      if (ELIGIBILITY_ONLY.test(sourceText)) continue;
      const hasCue =
        REQUIREMENT_CUE.test(sourceText) ||
        PREFERRED_CUE.test(sourceText) ||
        OPTIONAL_CUE.test(sourceText);
      if (!hasCue || NEGATED_REQUIREMENT_CUE.test(sourceText)) continue;

      const matchedTerms = TERMS.filter((term) =>
        termMatchesText(term, sourceText),
      );
      const alternatives = /\bor\b/i.test(sourceText)
        ? new Set(
            matchedTerms
              .filter(
                (term, _index, all) =>
                  all.filter(
                    (candidate) => candidate.dimension === term.dimension,
                  ).length > 1,
              )
              .map((term) => term.dimension),
          )
        : new Set<FitDimension>();

      for (const term of matchedTerms) {
        if (
          alternatives.has(term.dimension) &&
          matchedTerms.find(
            (candidate) => candidate.dimension === term.dimension,
          ) !== term
        ) {
          continue;
        }
        const modality = modalityFor(sourceText);
        const values = alternatives.has(term.dimension)
          ? matchedTerms
              .filter((candidate) => candidate.dimension === term.dimension)
              .map((candidate) => candidate.value)
          : [term.value];
        const normalizedValue = values.join('|');
        const label = values.join(' or ');
        const key = `${term.dimension}:${normalizedValue}:${modality}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push({
          id: requirementId(term.dimension, normalizedValue, output.length),
          dimension: term.dimension,
          normalizedValue,
          label,
          modality,
          sourceText,
          sourceReference,
          extractionConfidence: 'high',
        });
      }

      const experienceAfter = sourceText.match(
        /(?:minimum (?:of )?|at least )?(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:relevant\s+)?(?:professional\s+)?experience(?:\s+(?:with|in|as)\s+([^,.;]+))?/i,
      );
      const experienceBefore = sourceText.match(
        /(?:minimum (?:of )?|at least )?(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+([^,.;]+?)\s+experience\b/i,
      );
      const experience = experienceAfter ?? experienceBefore;
      if (experience?.[1]) {
        const years = Number.parseInt(experience[1], 10);
        const focus = normalizeExperienceFocus(experience[2]);
        const value = focus ? `${focus}:${years}` : `relevant:${years}`;
        const key = `experience_depth:${value}:${modalityFor(sourceText)}`;
        if (!seen.has(key)) {
          seen.add(key);
          output.push({
            id: requirementId('experience_depth', value, output.length),
            dimension: 'experience_depth',
            normalizedValue: focus ?? 'relevant',
            label: `${years}+ years ${focus ?? 'relevant'} experience`,
            modality: modalityFor(sourceText),
            sourceText,
            sourceReference,
            extractionConfidence: 'high',
            minimumYears: years,
          });
        }
      }
    }

    const seniority = extractSeniority(snapshot.title ?? '');
    if (seniority) {
      output.push({
        id: requirementId('seniority', seniority, output.length),
        dimension: 'seniority',
        normalizedValue: seniority,
        label: `${seniority} seniority`,
        modality: 'required',
        sourceText: snapshot.title ?? '',
        sourceReference,
        extractionConfidence: 'high',
      });
    }

    return output;
  }
}

function normalizeExperienceFocus(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().trim();
  const term = TERMS.find((candidate) =>
    termMatchesText(candidate, normalized),
  );
  return term?.value;
}

export function extractSeniority(title: string): string | undefined {
  const normalized = title.toLowerCase();
  if (/\b(principal|staff)\b/.test(normalized))
    return normalized.match(/\b(principal|staff)\b/)?.[1];
  if (/\b(senior|sr\.?)\b/.test(normalized)) return 'senior';
  if (/\b(junior|jr\.?|graduate|entry[- ]level)\b/.test(normalized))
    return 'junior';
  return undefined;
}

export function normalizeFitValue(value: string): string {
  const normalized = value.toLowerCase().trim();
  const term = TERMS.find((candidate) =>
    termMatchesText(candidate, normalized),
  );
  return term?.value ?? normalized.replace(/\s+/g, ' ');
}
