import { describe, expect, it } from 'vitest';
import {
  DecisionEngine,
  DECISION_ENGINE_VERSION,
  type DecisionEvaluationInput,
} from './engine.js';

describe('DecisionEngine V1', () => {
  const engine = new DecisionEngine();
  const fixedNow = new Date('2026-08-30T12:00:00.000Z');

  describe('Eligibility Blocker Invariant (Precedence 1)', () => {
    it('returns blocked / do_not_apply when Eligibility has a confirmed Hard Blocker, regardless of Strong Fit and Strong Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'ineligible',
          engineVersion: 'eligibility-v1',
          findings: [
            {
              dimension: 'work_authorization',
              state: 'HARD_BLOCKER',
              summary:
                'Requires US citizenship; candidate lacks US citizenship.',
            },
          ],
        },
        fit: {
          level: 'strong',
          engineVersion: 'fit-v1',
          summary: '100% direct match across all 10 requirements.',
        },
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
          summary:
            'Fresh, verified Greenhouse listing with clear compensation.',
        },
      };

      const result = engine.evaluate(input);

      expect(result.version).toBe(DECISION_ENGINE_VERSION);
      expect(result.state).toBe('blocked');
      expect(result.action).toBe('do_not_apply');
      expect(result.reasonCodes).toContain('ELIGIBILITY_BLOCKER');
      expect(result.reasonCodes).not.toContain('STRONG_REQUIRED_FIT');
      expect(result.explanation).toContain(
        'Blocked by confirmed eligibility blocker',
      );
      expect(result.explanation).toContain(
        'High fit or quality cannot override eligibility restrictions.',
      );
      expect(result.decisiveFindings).toHaveLength(1);
      expect(result.decisiveFindings[0]?.dimensionKey).toBe(
        'work_authorization',
      );
    });

    it('returns blocked when Eligibility is ineligible with Weak Fit and Risk Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'ineligible',
          engineVersion: 'eligibility-v1',
          findings: [
            {
              dimension: 'location',
              state: 'BLOCKER',
              summary:
                'Mandatory on-site in Tokyo, Japan; candidate in London, UK.',
            },
          ],
        },
        fit: {
          level: 'weak',
          engineVersion: 'fit-v1',
        },
        quality: {
          level: 'risk',
          engineVersion: 'quality-v1',
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('blocked');
      expect(result.action).toBe('do_not_apply');
      expect(result.reasonCodes).toEqual(['ELIGIBILITY_BLOCKER']);
    });
  });

  describe('Eligibility Unresolved / Material Uncertainty (Precedence 2)', () => {
    it('returns investigate when Eligibility is investigate, even with Strong Fit and Strong Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'investigate',
          engineVersion: 'eligibility-v1',
          findings: [
            {
              dimension: 'work_authorization',
              state: 'INVESTIGATE',
              summary:
                'Candidate requires visa sponsorship; listing does not state whether sponsorship is provided.',
            },
          ],
        },
        fit: {
          level: 'strong',
          engineVersion: 'fit-v1',
        },
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('investigate');
      expect(result.action).toBe('investigate');
      expect(result.reasonCodes).toContain('ELIGIBILITY_UNRESOLVED');
      expect(result.reasonCodes).toContain('STRONG_REQUIRED_FIT');
      expect(result.explanation).toContain(
        'Investigate eligibility before applying',
      );
      expect(result.explanation).toContain('visa sponsorship');
    });

    it('returns investigate when Eligibility is unknown with Weak Fit', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'unknown',
          engineVersion: 'eligibility-v1',
          findings: [
            {
              dimension: 'location',
              state: 'UNKNOWN',
              summary: 'Location requirements could not be extracted.',
            },
          ],
        },
        fit: {
          level: 'weak',
          engineVersion: 'fit-v1',
        },
        quality: {
          level: 'strong',
          engineVersion: 'quality-v1',
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('investigate');
      expect(result.action).toBe('investigate');
      expect(result.reasonCodes).toContain('ELIGIBILITY_UNRESOLVED');
    });
  });

  describe('Missing Dimensions', () => {
    it('returns investigate when Eligibility is missing entirely', () => {
      const result = engine.evaluate({
        evaluatedAt: fixedNow,
        eligibility: null,
        fit: { level: 'strong' },
        quality: { level: 'strong' },
      });

      expect(result.state).toBe('investigate');
      expect(result.action).toBe('investigate');
      expect(result.reasonCodes).toContain('ELIGIBILITY_UNRESOLVED');
      expect(result.explanation).toContain(
        'Eligibility evaluation is not yet available',
      );
    });

    it('returns investigate / review when Fit is missing for an eligible candidate', () => {
      const result = engine.evaluate({
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: null,
        quality: { level: 'strong' },
      });

      expect(result.state).toBe('investigate');
      expect(result.action).toBe('review');
      expect(result.explanation).toContain(
        'Candidate fit evaluation is not yet available',
      );
    });

    it('returns investigate / review when Quality is missing for an eligible candidate', () => {
      const result = engine.evaluate({
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: null,
      });

      expect(result.state).toBe('investigate');
      expect(result.action).toBe('review');
      expect(result.reasonCodes).toContain('QUALITY_UNCERTAINTY');
      expect(result.explanation).toContain(
        'Listing quality evaluation is not yet available',
      );
    });
  });

  describe('Quality Risk Semantics (Precedence 3)', () => {
    it('returns investigate when Quality is risk for an eligible candidate with strong fit', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: {
          level: 'risk',
          findings: [
            {
              dimension: 'application_link',
              label: 'Application Link',
              state: 'RISK',
              importance: 'critical',
              explanation: 'Application URL is malformed or invalid protocol.',
            },
          ],
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('investigate');
      expect(result.action).toBe('investigate');
      expect(result.reasonCodes).toContain('QUALITY_RISK');
      expect(result.reasonCodes).toContain('STRONG_REQUIRED_FIT');
      expect(result.explanation).toContain(
        'Investigate listing quality before applying: Application URL is malformed',
      );
    });

    it('returns investigate when Quality is risk due to explicit closed status', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'moderate' },
        quality: {
          level: 'risk',
          findings: [
            {
              dimension: 'listing_status',
              label: 'Listing Status',
              state: 'RISK',
              importance: 'critical',
              explanation:
                'Source discovery explicitly reported listing status as closed.',
            },
          ],
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('blocked');
      expect(result.action).toBe('do_not_apply');
      expect(result.reasonCodes).toEqual(['LISTING_CLOSED']);
    });
  });

  describe('Finding-Aware Quality Weakness', () => {
    it('recommends high-priority when Quality is weak solely due to missing compensation transparency', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: {
          level: 'weak',
          findings: [
            {
              dimension: 'compensation_transparency',
              state: 'WEAK',
              importance: 'transparency',
              explanation: 'No compensation information is present.',
            },
          ],
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('high-priority');
      expect(result.action).toBe('apply');
      expect(result.reasonCodes).toContain('ACTIONABLE_LISTING');
      expect(result.reasonCodes).toContain('STRONG_REQUIRED_FIT');
      expect(result.explanation).toContain(
        'Listing has transparency omissions (e.g. compensation) but remains actionable.',
      );
    });

    it('recommends consider when Quality is weak due to non-transparency signals like stale posting', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: {
          level: 'weak',
          findings: [
            {
              dimension: 'freshness',
              state: 'WEAK',
              importance: 'important',
              explanation: 'Listing is 45 days old.',
            },
          ],
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('consider');
      expect(result.action).toBe('review');
      expect(result.reasonCodes).toContain('QUALITY_UNCERTAINTY');
      expect(result.reasonCodes).toContain('STRONG_REQUIRED_FIT');
    });
  });

  describe('Actionable Matrix (Eligible + Sufficient Quality)', () => {
    it('returns high-priority / apply for Eligible + Strong Fit + Strong Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: { level: 'strong' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('high-priority');
      expect(result.action).toBe('apply');
      expect(result.reasonCodes).toEqual([
        'ACTIONABLE_LISTING',
        'STRONG_REQUIRED_FIT',
      ]);
      expect(result.explanation).toContain(
        'High priority: candidate is eligible, requirements match strongly, and listing quality is verified.',
      );
    });

    it('returns high-priority / apply for Eligible + Strong Fit + Moderate Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: { level: 'moderate' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('high-priority');
      expect(result.action).toBe('apply');
      expect(result.reasonCodes).toEqual([
        'ACTIONABLE_LISTING',
        'STRONG_REQUIRED_FIT',
      ]);
    });

    it('returns consider / review for Eligible + Moderate Fit + Strong Quality', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'moderate' },
        quality: { level: 'strong' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('consider');
      expect(result.action).toBe('review');
      expect(result.reasonCodes).toEqual([
        'ACTIONABLE_LISTING',
        'MODERATE_FIT',
      ]);
    });

    it('returns low-priority / review for Eligible + Weak Fit + Strong Quality (Weak fit is not blocked)', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'weak' },
        quality: { level: 'strong' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('low-priority');
      expect(result.action).toBe('review');
      expect(result.reasonCodes).toEqual([
        'ACTIONABLE_LISTING',
        'MATERIAL_FIT_GAPS',
      ]);
      expect(result.explanation).toContain(
        'Low priority: candidate is eligible, but material requirement gaps exist.',
      );
    });
  });

  describe('Malformed / Incoherent Upstream Inputs', () => {
    it('evaluates to blocked when eligibility findings contain a HARD_BLOCKER even if state string is incoherent (e.g. eligible)', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'eligible', // incoherent state string
          findings: [
            {
              dimension: 'work_authorization',
              state: 'HARD_BLOCKER',
              summary:
                'Requires German work authorization; candidate lacks German authorization.',
            },
          ],
        },
        fit: { level: 'strong' },
        quality: { level: 'strong' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('blocked');
      expect(result.action).toBe('do_not_apply');
      expect(result.reasonCodes).toContain('ELIGIBILITY_BLOCKER');
    });

    it('handles ineligible state string with empty findings gracefully', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: {
          state: 'ineligible',
          findings: [],
        },
        fit: { level: 'strong' },
        quality: { level: 'strong' },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('blocked');
      expect(result.action).toBe('do_not_apply');
      expect(result.reasonCodes).toEqual(['ELIGIBILITY_BLOCKER']);
      expect(result.explanation).toContain('Confirmed eligibility blocker');
    });

    it('handles Quality level risk with null/empty findings gracefully', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible' },
        fit: { level: 'strong' },
        quality: {
          level: 'risk',
          findings: null,
        },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('investigate');
      expect(result.action).toBe('investigate');
      expect(result.reasonCodes).toContain('QUALITY_RISK');
    });

    it('handles null/undefined findings across all dimensions without throwing', () => {
      const input: DecisionEvaluationInput = {
        evaluatedAt: fixedNow,
        eligibility: { state: 'eligible', findings: undefined },
        fit: { level: 'strong', findings: undefined },
        quality: { level: 'strong', findings: undefined },
      };

      const result = engine.evaluate(input);
      expect(result.state).toBe('high-priority');
      expect(result.action).toBe('apply');
      expect(result.decisiveFindings).toEqual([]);
    });
  });
});
