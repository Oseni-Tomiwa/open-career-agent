import {
  EligibilityConstraintExtractor,
  type EligibilityConstraint,
} from './extractor.js';

export type EligibilityState =
  'eligible' | 'ineligible' | 'investigate' | 'unknown';

export interface EligibilityFinding {
  dimension: string;
  state: EligibilityState;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  evidenceReferences: string[]; // references to constraint or candidate claims
}

export interface EligibilityEvaluationResult {
  version: string;
  overallState: EligibilityState;
  findings: EligibilityFinding[];
}

export class EligibilityEngine {
  private extractor = new EligibilityConstraintExtractor();
  public readonly version = 'eligibility-v1';

  evaluate(
    snapshot: {
      content?: string | null;
      location?: string | null;
      workModel?: string | null;
    },
    candidateClaims: Array<{
      kind: string;
      value?: string;
      state: string;
      scope?: string | null;
    }>,
  ): EligibilityEvaluationResult {
    const constraints = this.extractor.extract(snapshot);
    const findings: EligibilityFinding[] = [];

    // Group constraints by dimension
    const dimensions = new Set(constraints.map((c) => c.dimension));

    for (const dimension of dimensions) {
      const dimensionConstraints = constraints.filter(
        (c) => c.dimension === dimension,
      );
      const dimensionClaims = candidateClaims.filter(
        (c) => c.kind === dimension,
      );

      const finding = this.evaluateDimension(
        dimension,
        dimensionConstraints,
        dimensionClaims,
      );
      findings.push(finding);
    }

    // Check if any requirements in claims are unmet but no constraints exist (e.g. sponsorship)
    const claimDimensions = new Set(candidateClaims.map((c) => c.kind));
    for (const dimension of claimDimensions) {
      if (!dimensions.has(dimension)) {
        const dimensionClaims = candidateClaims.filter(
          (c) => c.kind === dimension,
        );
        const finding = this.evaluateDimension(dimension, [], dimensionClaims);
        if (finding) {
          findings.push(finding);
        }
      }
    }

    // Determine overall state
    let overallState: EligibilityState = 'eligible';

    if (findings.length === 0) {
      overallState = 'investigate'; // No eligibility constraints discovered, but cannot positively establish eligibility
    } else if (findings.some((f) => f.state === 'ineligible')) {
      overallState = 'ineligible'; // Any CONFIRMED HARD BLOCKER -> INELIGIBLE / BLOCKED
    } else if (findings.some((f) => f.state === 'investigate')) {
      overallState = 'investigate'; // No blocker, but material UNKNOWN/CONTRADICTORY -> INVESTIGATE
    } else if (findings.some((f) => f.state === 'unknown')) {
      overallState = 'investigate'; // Treat unknown as investigate if nothing is blocked, wait, docs say "unknown or appropriate documented state"
    }

    return {
      version: this.version,
      overallState,
      findings,
    };
  }

  private evaluateDimension(
    dimension: string,
    constraints: EligibilityConstraint[],
    claims: Array<{
      kind: string;
      value?: string;
      state: string;
      scope?: string | null;
    }>,
  ): EligibilityFinding {
    if (dimension === 'sponsorship') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      const candRequiresSponsorship = claims.find(
        (c) => c.value === 'requires_sponsorship' && c.state === 'supported',
      );

      if (req && req.requirement.includes('not need sponsorship')) {
        if (candRequiresSponsorship) {
          return {
            dimension,
            state: 'ineligible',
            summary: 'Candidate requires sponsorship but it is not available.',
            confidence: 'high',
            evidenceReferences: [],
          };
        } else if (claims.length === 0) {
          return {
            dimension,
            state: 'investigate',
            summary:
              'Sponsorship policy blocks sponsorship, but candidate need is unknown.',
            confidence: 'medium',
            evidenceReferences: [],
          };
        }
      } else if (req && req.requirement.includes('is available')) {
        if (candRequiresSponsorship) {
          return {
            dimension,
            state: 'eligible',
            summary: 'Sponsorship is available and candidate needs it.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
      } else if (!req) {
        if (candRequiresSponsorship) {
          return {
            dimension,
            state: 'investigate',
            summary: 'Candidate requires sponsorship but policy is unknown.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
      }
    }

    if (dimension === 'work_authorization') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      const candAuth = claims.find((c) => c.state === 'supported');
      const activeReject = claims.find(
        (c) => c.state === 'conflict' && c.scope === req?.scope,
      );

      if (req) {
        if (candAuth && activeReject) {
          return {
            dimension,
            state: 'investigate',
            summary: 'Contradictory claims regarding work authorization',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (activeReject) {
          return {
            dimension,
            state: 'ineligible',
            summary: 'Candidate explicitly lacks required work authorization',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (!candAuth) {
          return {
            dimension,
            state: 'investigate',
            summary: 'Authorization required but candidate status unknown.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (candAuth && candAuth.scope !== req.scope) {
          return {
            dimension,
            state: 'investigate',
            summary:
              'Candidate has other work authorization, but required scope is unknown.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        return {
          dimension,
          state: 'eligible',
          summary: 'Candidate meets work authorization requirements.',
          confidence: 'high',
          evidenceReferences: [],
        };
      }
    }

    if (dimension === 'location') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      const candLoc = claims.find(
        (c) => c.kind === 'location' && c.state === 'supported',
      );

      if (req) {
        if (candLoc && candLoc.value !== req.scope) {
          const text = req.sourceText.toLowerCase();
          const hasStrictRequirement =
            /(must (currently )?(reside|be based) in|remote (within|in) .* only|outside .* (are )?not eligible)/.test(
              text,
            );
          const hasNoRelocation =
            /(no relocation|relocation is not available)/.test(text);
          const hasRelocationAllowance =
            /(relocation support|relocation assistance|relocation available)/.test(
              text,
            );
          const hasFutureAllowance = /by start date/.test(text);
          const isStrictLocation =
            (hasStrictRequirement || hasNoRelocation) &&
            !hasRelocationAllowance &&
            !hasFutureAllowance;

          return {
            dimension,
            state: isStrictLocation ? 'ineligible' : 'investigate',
            summary: isStrictLocation
              ? 'Candidate location directly conflicts with strict geographic requirement.'
              : 'Location required does not match known candidate location.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
      }
    }

    if (dimension === 'citizenship') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      const candCit = claims.find(
        (c) => c.kind === 'citizenship' && c.state === 'supported',
      );
      const activeReject = claims.find(
        (c) =>
          c.kind === 'citizenship' &&
          c.state === 'conflict' &&
          c.scope === req?.scope,
      );
      if (req) {
        if (candCit && candCit.scope === req.scope && activeReject) {
          return {
            dimension,
            state: 'investigate',
            summary: 'Contradictory claims regarding citizenship',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (
          candCit &&
          candCit.value !== req.scope &&
          candCit.scope !== req.scope
        ) {
          return {
            dimension,
            state: 'investigate',
            summary:
              'Citizenship required does not match known candidate citizenship.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (activeReject) {
          return {
            dimension,
            state: 'ineligible',
            summary: 'Candidate explicitly lacks required citizenship.',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        if (candCit && candCit.scope === req.scope) {
          return {
            dimension,
            state: 'eligible',
            summary: 'Candidate has required citizenship',
            confidence: 'high',
            evidenceReferences: [],
          };
        }
        return {
          dimension,
          state: 'investigate',
          summary: 'Requires citizenship but candidate citizenship unknown',
          confidence: 'high',
          evidenceReferences: [],
        };
      }
    }

    if (dimension === 'current_student') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      const candNotStudent = claims.find(
        (c) =>
          c.kind === 'current_student' &&
          c.value === 'false' &&
          c.state === 'supported',
      );
      if (req && candNotStudent) {
        return {
          dimension,
          state: 'ineligible',
          summary: 'Role requires current student, candidate is not enrolled.',
          confidence: 'high',
          evidenceReferences: [],
        };
      }
    }

    if (dimension === 'clearance') {
      const req = constraints.find((c) => c.modality === 'mandatory');
      if (req) {
        const hasClearance = claims.find(
          (c) =>
            c.kind === 'clearance' &&
            c.state === 'supported' &&
            c.scope === req.scope,
        );
        const activeReject = claims.find(
          (c) =>
            c.kind === 'clearance' &&
            c.state === 'conflict' &&
            c.scope === req.scope,
        );
        if (hasClearance && activeReject)
          return {
            dimension,
            state: 'investigate',
            summary: 'Contradictory claims regarding clearance',
            confidence: 'high',
            evidenceReferences: [],
          };
        if (hasClearance)
          return {
            dimension,
            state: 'eligible',
            summary: `Candidate has required ${req.scope} clearance`,
            confidence: 'high',
            evidenceReferences: [],
          };
        if (activeReject)
          return {
            dimension,
            state: 'ineligible',
            summary: `Candidate explicitly lacks required ${req.scope} clearance`,
            confidence: 'high',
            evidenceReferences: [],
          };
        return {
          dimension,
          state: 'investigate',
          summary: `Requires ${req.scope} clearance but candidate clearance status unknown`,
          confidence: 'high',
          evidenceReferences: [],
        };
      }
      return {
        dimension,
        state: 'eligible',
        summary: 'No clearance requirements found',
        confidence: 'high',
        evidenceReferences: [],
      };
    }

    if (dimension === 'language') {
      const mandatoryReq = constraints.find((c) => c.modality === 'mandatory');
      const preferredReq = constraints.find((c) => c.modality === 'preferred');
      if (mandatoryReq) {
        const hasLang = claims.find(
          (c) =>
            c.kind === 'language' &&
            c.state === 'supported' &&
            c.scope === mandatoryReq.scope,
        );
        const conflictLang = claims.find(
          (c) =>
            c.kind === 'language' &&
            c.state === 'conflict' &&
            c.scope === mandatoryReq.scope,
        );
        if (hasLang && conflictLang)
          return {
            dimension,
            state: 'investigate',
            summary: 'Contradictory claims regarding language fluency',
            confidence: 'high',
            evidenceReferences: [],
          };
        if (hasLang)
          return {
            dimension,
            state: 'eligible',
            summary: `Candidate is fluent in ${mandatoryReq.scope}`,
            confidence: 'high',
            evidenceReferences: [],
          };
        if (conflictLang)
          return {
            dimension,
            state: 'ineligible',
            summary: `Candidate explicitly not fluent in ${mandatoryReq.scope}`,
            confidence: 'high',
            evidenceReferences: [],
          };
        return {
          dimension,
          state: 'investigate',
          summary: `Requires ${mandatoryReq.scope} fluency but candidate language status unknown`,
          confidence: 'high',
          evidenceReferences: [],
        };
      }
      if (preferredReq) {
        return {
          dimension,
          state: 'eligible',
          summary: `${preferredReq.scope} is preferred but not mandatory for eligibility`,
          confidence: 'high',
          evidenceReferences: [],
        };
      }
      return {
        dimension,
        state: 'eligible',
        summary: 'No language requirements found',
        confidence: 'high',
        evidenceReferences: [],
      };
    }

    if (constraints.length === 0) {
      return null as unknown as EligibilityFinding; // No constraint and no specific claim rule triggered it
    }
    return {
      dimension,
      state: 'unknown',
      summary: 'Insufficient deterministic information to evaluate.',
      confidence: 'low',
      evidenceReferences: [],
    };
  }
}
