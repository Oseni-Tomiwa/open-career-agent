export const OPPORTUNITY_TYPES = [
  'JOB',
  'INTERNSHIP',
  'FREELANCE_CONTRACT',
  'FELLOWSHIP',
  'GRANT',
  'COMPETITION',
  'HACKATHON',
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export interface ManualOpportunityInput {
  category: OpportunityType;
  title: string;
  organization: string;
  sourceUrl: string | null;
  sourceContext: string | null;
  deadline: string | null;
}

export function normalizeManualOpportunityInput(
  input: ManualOpportunityInput,
): ManualOpportunityInput | null {
  const title = input.title.trim();
  const organization = input.organization.trim();
  const sourceUrl = input.sourceUrl?.trim() || null;
  const sourceContext = input.sourceContext?.trim() || null;
  const deadline = input.deadline;
  if (
    !OPPORTUNITY_TYPES.includes(input.category) ||
    !title ||
    title.length > 200 ||
    !organization ||
    organization.length > 200 ||
    (!sourceUrl && !sourceContext) ||
    (sourceContext && sourceContext.length > 1000)
  )
    return null;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (
        sourceUrl.length > 2048 ||
        !/^https?:\/\//i.test(sourceUrl) ||
        url.username ||
        url.password ||
        /[\s\\]/.test(sourceUrl)
      )
        return null;
    } catch {
      return null;
    }
  }
  if (deadline !== null) {
    if (!/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(deadline)) return null;
    const date = new Date(deadline + 'T00:00:00.000Z');
    if (
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== deadline
    )
      return null;
  }
  return {
    category: input.category,
    title,
    organization,
    sourceUrl,
    sourceContext,
    deadline,
  };
}
