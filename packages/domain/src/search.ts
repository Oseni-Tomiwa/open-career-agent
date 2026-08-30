export const SEARCH_WORK_MODELS = ['remote', 'hybrid', 'onsite'] as const;
export type SearchWorkModel = (typeof SEARCH_WORK_MODELS)[number];

export const SEARCH_SENIORITY_LEVELS = [
  'internship',
  'entry',
  'junior',
  'mid',
  'senior',
] as const;
export type SearchSeniorityLevel = (typeof SEARCH_SENIORITY_LEVELS)[number];

export const SEARCH_EMPLOYMENT_TYPES = [
  'full-time',
  'contract',
  'internship',
] as const;
export type SearchEmploymentType = (typeof SEARCH_EMPLOYMENT_TYPES)[number];

export interface SearchSourceConfig {
  sourceSystem: string;
  boardId: string;
}

export interface SearchTarget {
  id: string;
  candidateId: string;
  name: string;
  enabled: boolean;
  targetRoles: string[];
  skills: string[];
  locations: string[];
  locationIsHardFilter: boolean;
  workModels: SearchWorkModel[];
  workModelIsHardFilter: boolean;
  seniorityLevels: SearchSeniorityLevel[];
  seniorityIsHardFilter: boolean;
  employmentTypes: SearchEmploymentType[];
  employmentTypeIsHardFilter: boolean;
  requiresSponsorship: boolean | null;
  willingToRelocate: boolean | null;
  minSalary: number | null;
  currency: string | null;
  freshnessDays: number | null;
  requiredTerms: string[];
  excludedTerms: string[];
  sources: SearchSourceConfig[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface OpportunitySnapshotTargetView {
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: string | null;
  employmentType?: string | null;
  content?: string | null;
  compensation?: string | null;
}

export interface DiscoveryMatchResult {
  isMatch: boolean;
  rejectionReason: string | null;
  matchedTerms: string[];
  retainedUnresolved: string[];
  matchReasons: string[];
}

export function evaluateDiscoveryMatch(
  target: SearchTarget,
  snapshot: OpportunitySnapshotTargetView,
): DiscoveryMatchResult {
  if (!target.enabled) {
    return {
      isMatch: false,
      rejectionReason: 'TARGET_DISABLED',
      matchedTerms: [],
      retainedUnresolved: [],
      matchReasons: [],
    };
  }

  const titleLower = snapshot.title.toLowerCase();
  const contentLower = (snapshot.content ?? '').toLowerCase();

  // 1. Excluded terms check (HARD FILTER)
  for (const term of target.excludedTerms) {
    const termLower = term.trim().toLowerCase();
    if (!termLower) continue;
    if (titleLower.includes(termLower) || contentLower.includes(termLower)) {
      return {
        isMatch: false,
        rejectionReason: `EXCLUDED_TERM: ${term}`,
        matchedTerms: [],
        retainedUnresolved: [],
        matchReasons: [],
      };
    }
  }

  const matchedTerms: string[] = [];
  const retainedUnresolved: string[] = [];
  const matchReasons: string[] = [];

  // 2. Role targets / title check
  if (target.targetRoles.length > 0) {
    let titleMatched = false;
    for (const role of target.targetRoles) {
      const roleLower = role.trim().toLowerCase();
      if (!roleLower) continue;
      if (titleLower.includes(roleLower)) {
        titleMatched = true;
        matchedTerms.push(role);
        matchReasons.push(`Matched role target: ${role}`);
      }
    }
    // Also check required terms if title role check didn't match directly
    if (!titleMatched) {
      let requiredTermInTitle = false;
      for (const term of target.requiredTerms) {
        const termLower = term.trim().toLowerCase();
        if (termLower && titleLower.includes(termLower)) {
          requiredTermInTitle = true;
          break;
        }
      }
      if (!requiredTermInTitle) {
        return {
          isMatch: false,
          rejectionReason: 'ROLE_TITLE_MISMATCH',
          matchedTerms: [],
          retainedUnresolved: [],
          matchReasons: [],
        };
      }
    }
  }

  // 3. Required terms check (HARD FILTER)
  for (const term of target.requiredTerms) {
    const termLower = term.trim().toLowerCase();
    if (!termLower) continue;
    if (titleLower.includes(termLower) || contentLower.includes(termLower)) {
      matchedTerms.push(term);
      matchReasons.push(`Matched required term: ${term}`);
    } else {
      return {
        isMatch: false,
        rejectionReason: `REQUIRED_TERM_MISSING: ${term}`,
        matchedTerms: [],
        retainedUnresolved: [],
        matchReasons: [],
      };
    }
  }

  // 4. Location matching (HARD vs PREFERENCE)
  if (target.locations.length > 0) {
    const locLower = (snapshot.location ?? '').trim().toLowerCase();
    if (!locLower) {
      retainedUnresolved.push('Location unstated in opportunity');
    } else {
      let locMatched = false;
      for (const loc of target.locations) {
        const targetLocLower = loc.trim().toLowerCase();
        if (
          locLower.includes(targetLocLower) ||
          targetLocLower.includes(locLower) ||
          (targetLocLower.includes('remote') && locLower.includes('remote'))
        ) {
          locMatched = true;
          matchReasons.push(`Matched location: ${loc}`);
          break;
        }
      }
      if (!locMatched) {
        if (target.locationIsHardFilter) {
          return {
            isMatch: false,
            rejectionReason: `LOCATION_HARD_REJECT: ${snapshot.location}`,
            matchedTerms: [],
            retainedUnresolved: [],
            matchReasons: [],
          };
        } else {
          retainedUnresolved.push(
            `Location preference unmatched: ${snapshot.location}`,
          );
        }
      }
    }
  }

  // 5. Work model matching (HARD vs PREFERENCE)
  if (target.workModels.length > 0) {
    const workModelLower = (snapshot.workModel ?? '').trim().toLowerCase();
    if (!workModelLower) {
      retainedUnresolved.push('Work model unstated in opportunity');
    } else {
      const isWorkModelMatched = target.workModels.some(
        (wm) => wm.toLowerCase() === workModelLower,
      );
      if (isWorkModelMatched) {
        matchReasons.push(`Matched work model: ${snapshot.workModel}`);
      } else {
        if (target.workModelIsHardFilter) {
          return {
            isMatch: false,
            rejectionReason: `WORK_MODEL_HARD_REJECT: ${snapshot.workModel}`,
            matchedTerms: [],
            retainedUnresolved: [],
            matchReasons: [],
          };
        } else {
          retainedUnresolved.push(
            `Work model preference unmatched: ${snapshot.workModel}`,
          );
        }
      }
    }
  }

  // 6. Seniority matching (HARD vs PREFERENCE)
  if (target.seniorityLevels.length > 0) {
    let detectedSeniority: string | null = null;
    if (/\bsenior\b/i.test(titleLower)) detectedSeniority = 'senior';
    else if (/\bjunior\b/i.test(titleLower)) detectedSeniority = 'junior';
    else if (/\bintern(ship)?\b/i.test(titleLower))
      detectedSeniority = 'internship';
    else if (/\bentry\b/i.test(titleLower)) detectedSeniority = 'entry';
    else if (/\bmid\b/i.test(titleLower) || /\blead\b/i.test(titleLower))
      detectedSeniority = 'mid';

    if (!detectedSeniority) {
      retainedUnresolved.push('Seniority level unstated in title');
    } else {
      const seniorityMatched = target.seniorityLevels.includes(
        detectedSeniority as SearchSeniorityLevel,
      );
      if (seniorityMatched) {
        matchReasons.push(`Matched seniority level: ${detectedSeniority}`);
      } else {
        if (target.seniorityIsHardFilter) {
          return {
            isMatch: false,
            rejectionReason: `SENIORITY_HARD_REJECT: ${detectedSeniority}`,
            matchedTerms: [],
            retainedUnresolved: [],
            matchReasons: [],
          };
        } else {
          retainedUnresolved.push(
            `Seniority preference unmatched: ${detectedSeniority}`,
          );
        }
      }
    }
  }

  // 7. Employment type matching (HARD vs PREFERENCE)
  if (target.employmentTypes.length > 0) {
    const empLower = (snapshot.employmentType ?? '').trim().toLowerCase();
    if (!empLower) {
      retainedUnresolved.push('Employment type unstated');
    } else {
      const empMatched = target.employmentTypes.some(
        (et) => et.toLowerCase() === empLower,
      );
      if (empMatched) {
        matchReasons.push(
          `Matched employment type: ${snapshot.employmentType}`,
        );
      } else {
        if (target.employmentTypeIsHardFilter) {
          return {
            isMatch: false,
            rejectionReason: `EMPLOYMENT_TYPE_HARD_REJECT: ${snapshot.employmentType}`,
            matchedTerms: [],
            retainedUnresolved: [],
            matchReasons: [],
          };
        } else {
          retainedUnresolved.push(
            `Employment type preference unmatched: ${snapshot.employmentType}`,
          );
        }
      }
    }
  }

  return {
    isMatch: true,
    rejectionReason: null,
    matchedTerms,
    retainedUnresolved,
    matchReasons,
  };
}
