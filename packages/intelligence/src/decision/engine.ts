export const DECISION_ENGINE_VERSION = 'decision-v1';

export type DecisionState =
  'high-priority' | 'consider' | 'investigate' | 'low-priority' | 'blocked';

export type DecisionAction =
  'apply' | 'review' | 'investigate' | 'do_not_apply';

export type DecisionReasonCode =
  | 'ELIGIBILITY_BLOCKER'
  | 'LISTING_CLOSED'
  | 'LISTING_STALE'
  | 'ELIGIBILITY_UNRESOLVED'
  | 'STRONG_REQUIRED_FIT'
  | 'MODERATE_FIT'
  | 'MATERIAL_FIT_GAPS'
  | 'QUALITY_RISK'
  | 'QUALITY_UNCERTAINTY'
  | 'ACTIONABLE_LISTING';

export interface DecisionFindingReference {
  readonly category: 'eligibility' | 'fit' | 'quality';
  readonly dimensionKey: string;
  readonly state: string;
  readonly summary: string;
}

export interface DecisionEligibilityFindingInput {
  readonly dimension: string;
  readonly state: string;
  readonly summary: string;
  readonly confidence?: string | null | undefined;
}

export interface DecisionEligibilityInput {
  readonly state: 'eligible' | 'ineligible' | 'investigate' | 'unknown';
  readonly engineVersion?: string | null | undefined;
  readonly inputFingerprint?: string | null | undefined;
  readonly findings?:
    readonly DecisionEligibilityFindingInput[] | null | undefined;
}

export interface DecisionFitFindingInput {
  readonly dimensionKey: string;
  readonly label?: string | null | undefined;
  readonly state: string;
  readonly modality?: string | null | undefined;
  readonly requirementText?: string | null | undefined;
  readonly explanation?: string | null | undefined;
}

export interface DecisionFitInput {
  readonly level: 'strong' | 'moderate' | 'weak';
  readonly engineVersion?: string | null | undefined;
  readonly inputFingerprint?: string | null | undefined;
  readonly summary?: string | null | undefined;
  readonly findings?: readonly DecisionFitFindingInput[] | null | undefined;
}

export interface DecisionQualityFindingInput {
  readonly dimension: string;
  readonly label?: string | null | undefined;
  readonly state: string;
  readonly importance?: string | null | undefined;
  readonly explanation?: string | null | undefined;
}

export interface DecisionQualityInput {
  readonly level: 'strong' | 'moderate' | 'weak' | 'risk';
  readonly engineVersion?: string | null | undefined;
  readonly inputFingerprint?: string | null | undefined;
  readonly freshnessBucket?: string | null | undefined;
  readonly summary?: string | null | undefined;
  readonly findings?: readonly DecisionQualityFindingInput[] | null | undefined;
}

export interface DecisionEvaluationInput {
  readonly eligibility?: DecisionEligibilityInput | null;
  readonly fit?: DecisionFitInput | null;
  readonly quality?: DecisionQualityInput | null;
  readonly evaluatedAt?: Date;
}

export interface DecisionResult {
  readonly version: typeof DECISION_ENGINE_VERSION;
  readonly state: DecisionState;
  readonly action: DecisionAction;
  readonly reasonCodes: readonly DecisionReasonCode[];
  readonly explanation: string;
  readonly decisiveFindings: readonly DecisionFindingReference[];
  readonly evaluatedAt: string;
}

function fitReference(
  fit: DecisionFitInput,
  level: 'strong' | 'moderate' | 'weak',
): readonly DecisionFindingReference[] {
  const finding = (fit.findings ?? []).find((item) => {
    if (level === 'strong') return /MATCH|SUPPORTED|STRONG/i.test(item.state);
    if (level === 'weak')
      return /GAP|PARTIAL|NO_EVIDENCE|WEAK/i.test(item.state);
    return true;
  });
  return finding
    ? [
        {
          category: 'fit',
          dimensionKey: finding.dimensionKey,
          state: finding.state,
          summary:
            finding.explanation ??
            finding.label ??
            finding.requirementText ??
            finding.dimensionKey,
        },
      ]
    : [];
}

export class DecisionEngine {
  public evaluate(input: DecisionEvaluationInput): DecisionResult {
    const evaluatedAtDate = input.evaluatedAt ?? new Date();
    const evaluatedAtIso = evaluatedAtDate.toISOString();

    const eligibility = input.eligibility;
    const fit = input.fit;
    const quality = input.quality;

    // 1. Missing upstream dimensions
    if (!eligibility) {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'investigate',
        reasonCodes: ['ELIGIBILITY_UNRESOLVED'],
        explanation:
          'Eligibility evaluation is not yet available; cannot determine if opportunity is pursuable.',
        decisiveFindings: [],
        evaluatedAt: evaluatedAtIso,
      };
    }

    // 2. Confirmed Hard Blocker -> BLOCKED. Eligibility remains the authority.
    const blockerFindings = (eligibility.findings ?? [])
      .filter((f) => f.state === 'BLOCKER' || f.state === 'HARD_BLOCKER')
      .map((f) => ({
        category: 'eligibility' as const,
        dimensionKey: f.dimension,
        state: f.state,
        summary: f.summary,
      }));

    if (eligibility.state === 'ineligible' || blockerFindings.length > 0) {
      const blockerDetails =
        blockerFindings.length > 0
          ? blockerFindings.map((b) => b.summary).join('; ')
          : 'Confirmed eligibility blocker prevents application.';

      return {
        version: DECISION_ENGINE_VERSION,
        state: 'blocked',
        action: 'do_not_apply',
        reasonCodes: ['ELIGIBILITY_BLOCKER'],
        explanation: `Blocked by confirmed eligibility blocker: ${blockerDetails}. High fit or quality cannot override eligibility restrictions.`,
        decisiveFindings: blockerFindings,
        evaluatedAt: evaluatedAtIso,
      };
    }

    // 3. Unresolved Eligibility -> INVESTIGATE (Precedence 2)
    if (
      eligibility.state === 'investigate' ||
      eligibility.state === 'unknown'
    ) {
      const unresolvedFindings = (eligibility.findings ?? [])
        .filter(
          (f) =>
            f.state === 'UNKNOWN' ||
            f.state === 'INVESTIGATE' ||
            f.state === 'UNRESOLVED',
        )
        .map((f) => ({
          category: 'eligibility' as const,
          dimensionKey: f.dimension,
          state: f.state,
          summary: f.summary,
        }));

      const reasonCodes: DecisionReasonCode[] = ['ELIGIBILITY_UNRESOLVED'];
      if (quality?.level === 'risk') {
        reasonCodes.push('QUALITY_RISK');
      }
      if (fit?.level === 'strong') {
        reasonCodes.push('STRONG_REQUIRED_FIT');
      }

      const unresolvedDetails =
        unresolvedFindings.length > 0
          ? unresolvedFindings.map((u) => u.summary).join('; ')
          : 'Material eligibility requirements remain unresolved.';

      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'investigate',
        reasonCodes,
        explanation: `Investigate eligibility before applying: ${unresolvedDetails}`,
        decisiveFindings: unresolvedFindings,
        evaluatedAt: evaluatedAtIso,
      };
    }

    // At this stage, eligibility.state === 'eligible'.

    // 4. Missing Fit or Quality
    if (!fit) {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'review',
        reasonCodes: ['MODERATE_FIT'],
        explanation:
          'Candidate fit evaluation is not yet available; cannot determine recommendation priority.',
        decisiveFindings: [],
        evaluatedAt: evaluatedAtIso,
      };
    }

    if (!quality) {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'review',
        reasonCodes: ['QUALITY_UNCERTAINTY'],
        explanation:
          'Listing quality evaluation is not yet available; cannot confirm listing legitimacy or freshness.',
        decisiveFindings: [],
        evaluatedAt: evaluatedAtIso,
      };
    }

    // Operational currency is distinct from closure. A very stale listing is
    // not proof that the candidate is ineligible or that the listing is
    // closed, but it is insufficiently current for an apply recommendation.
    const staleFindings = (quality.findings ?? [])
      .filter(
        (finding) =>
          finding.dimension === 'freshness' && finding.state === 'RISK',
      )
      .map((finding) => ({
        category: 'quality' as const,
        dimensionKey: finding.dimension,
        state: finding.state,
        summary: finding.explanation ?? finding.label ?? finding.dimension,
      }));
    if (staleFindings.length > 0) {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'investigate',
        reasonCodes: ['LISTING_STALE'],
        explanation: `Investigate listing currency before applying: ${staleFindings.map((finding) => finding.summary).join('; ')}`,
        decisiveFindings: staleFindings,
        evaluatedAt: evaluatedAtIso,
      };
    }

    // 5. Eligible + Quality RISK (Precedence 3)
    if (quality.level === 'risk') {
      const riskFindings = (quality.findings ?? [])
        .filter((f) => f.state === 'RISK')
        .map((f) => ({
          category: 'quality' as const,
          dimensionKey: f.dimension,
          state: f.state,
          summary: f.explanation ?? f.label ?? f.dimension,
        }));

      const closedFindings = riskFindings.filter(
        (finding) => finding.dimensionKey === 'listing_status',
      );
      const explicitlyClosed = closedFindings.some((finding) =>
        /\b(closed|removed)\b/i.test(finding.summary),
      );
      if (explicitlyClosed) {
        return {
          version: DECISION_ENGINE_VERSION,
          state: 'blocked',
          action: 'do_not_apply',
          reasonCodes: ['LISTING_CLOSED'],
          explanation: `Blocked because the source explicitly reports this listing closed: ${closedFindings.map((finding) => finding.summary).join('; ')}`,
          decisiveFindings: closedFindings,
          evaluatedAt: evaluatedAtIso,
        };
      }

      const reasonCodes: DecisionReasonCode[] = ['QUALITY_RISK'];
      if (fit.level === 'strong') {
        reasonCodes.push('STRONG_REQUIRED_FIT');
      } else if (fit.level === 'moderate') {
        reasonCodes.push('MODERATE_FIT');
      }

      const riskDetails =
        riskFindings.length > 0
          ? riskFindings.map((r) => r.summary).join('; ')
          : 'Listing has critical quality risk signals.';

      return {
        version: DECISION_ENGINE_VERSION,
        state: 'investigate',
        action: 'investigate',
        reasonCodes,
        explanation: `Investigate listing quality before applying: ${riskDetails}`,
        decisiveFindings: riskFindings,
        evaluatedAt: evaluatedAtIso,
      };
    }

    // 6. Eligible + Quality WEAK (Finding-Aware)
    if (quality.level === 'weak') {
      // Check if quality is weak solely due to transparency (e.g. missing compensation / employment type)
      const nonTransparencyWeaknesses = (quality.findings ?? []).filter(
        (f) =>
          f.importance !== 'transparency' &&
          (f.state === 'WEAK' || f.state === 'RISK'),
      );

      const isOnlyTransparencyWeak =
        (quality.findings?.length ?? 0) > 0 &&
        nonTransparencyWeaknesses.length === 0;

      if (isOnlyTransparencyWeak && fit.level === 'strong') {
        return {
          version: DECISION_ENGINE_VERSION,
          state: 'high-priority',
          action: 'apply',
          reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
          explanation:
            'High priority: candidate is eligible and requirements match strongly. Listing has transparency omissions (e.g. compensation) but remains actionable.',
          decisiveFindings: fitReference(fit, 'strong'),
          evaluatedAt: evaluatedAtIso,
        };
      }

      if (isOnlyTransparencyWeak && fit.level === 'moderate') {
        return {
          version: DECISION_ENGINE_VERSION,
          state: 'consider',
          action: 'review',
          reasonCodes: ['ACTIONABLE_LISTING', 'MODERATE_FIT'],
          explanation:
            'Consider: candidate is eligible with moderate requirement alignment. Listing lacks compensation transparency but remains actionable.',
          decisiveFindings: fitReference(fit, 'moderate'),
          evaluatedAt: evaluatedAtIso,
        };
      }

      // Quality has non-transparency weakness (e.g. stale freshness or low content completeness)
      if (fit.level === 'strong') {
        return {
          version: DECISION_ENGINE_VERSION,
          state: 'consider',
          action: 'review',
          reasonCodes: ['QUALITY_UNCERTAINTY', 'STRONG_REQUIRED_FIT'],
          explanation:
            'Consider: candidate is eligible and well-matched, but listing quality has notable weaknesses (e.g. stale posting or low completeness).',
          decisiveFindings: nonTransparencyWeaknesses.map((f) => ({
            category: 'quality',
            dimensionKey: f.dimension,
            state: f.state,
            summary: f.explanation ?? f.label ?? f.dimension,
          })),
          evaluatedAt: evaluatedAtIso,
        };
      }

      if (fit.level === 'moderate') {
        return {
          version: DECISION_ENGINE_VERSION,
          state: 'consider',
          action: 'review',
          reasonCodes: ['QUALITY_UNCERTAINTY', 'MODERATE_FIT'],
          explanation:
            'Consider: candidate is eligible with moderate match, but listing quality has weaknesses.',
          decisiveFindings: nonTransparencyWeaknesses.map((f) => ({
            category: 'quality',
            dimensionKey: f.dimension,
            state: f.state,
            summary: f.explanation ?? f.label ?? f.dimension,
          })),
          evaluatedAt: evaluatedAtIso,
        };
      }

      return {
        version: DECISION_ENGINE_VERSION,
        state: 'low-priority',
        action: 'review',
        reasonCodes: ['MATERIAL_FIT_GAPS', 'QUALITY_UNCERTAINTY'],
        explanation:
          'Low priority: candidate is eligible, but weak requirement alignment and weak listing quality make this low priority.',
        decisiveFindings: [],
        evaluatedAt: evaluatedAtIso,
      };
    }

    // 7. Eligible + Quality STRONG or MODERATE (Precedence 4 & 5)
    if (fit.level === 'strong') {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'high-priority',
        action: 'apply',
        reasonCodes: ['ACTIONABLE_LISTING', 'STRONG_REQUIRED_FIT'],
        explanation:
          quality.level === 'strong'
            ? 'High priority: candidate is eligible, requirements match strongly, and listing quality is verified.'
            : 'High priority: candidate is eligible and requirements match strongly, with adequate listing quality.',
        decisiveFindings: fitReference(fit, 'strong'),
        evaluatedAt: evaluatedAtIso,
      };
    }

    if (fit.level === 'moderate') {
      return {
        version: DECISION_ENGINE_VERSION,
        state: 'consider',
        action: 'review',
        reasonCodes: ['ACTIONABLE_LISTING', 'MODERATE_FIT'],
        explanation:
          'Consider: candidate is eligible and listing is actionable, with moderate requirement alignment.',
        decisiveFindings: fitReference(fit, 'moderate'),
        evaluatedAt: evaluatedAtIso,
      };
    }

    // fit.level === 'weak'
    return {
      version: DECISION_ENGINE_VERSION,
      state: 'low-priority',
      action: 'review',
      reasonCodes: ['ACTIONABLE_LISTING', 'MATERIAL_FIT_GAPS'],
      explanation:
        'Low priority: candidate is eligible, but material requirement gaps exist.',
      decisiveFindings: fitReference(fit, 'weak'),
      evaluatedAt: evaluatedAtIso,
    };
  }
}
