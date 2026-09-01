import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { useProductData } from '../../app/ProductDataProvider.js';
import { EmptyState } from '../../components/EmptyState.js';
import { PageHeader } from '../../components/PageHeader.js';
import { EvidenceStateLabel } from '../../components/Status.js';
import type {
  CandidateClaimState,
  CareerMemoryClaim,
  CareerMemoryProfile,
  CreateCandidateClaimInput,
  ManualEvidenceInput,
  ReplaceCandidateClaimInput,
  CareerProfileReevaluation,
} from '../../data/types.js';

const SECTION_ORDER = [
  'Skills',
  'Experience and projects',
  'Education and certifications',
  'Languages',
  'Location and work authorization',
  'Other profile information',
] as const;

export function ProfilePage() {
  const {
    dataSource,
    getCareerMemory,
    createCandidateClaimsBatch,
    updateCandidateClaim,
    attachClaimEvidence,
    replaceCandidateClaim,
    retireCandidateClaim,
    getCareerProfileReevaluation,
  } = useProductData();
  const [profile, setProfile] = useState<CareerMemoryProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reevaluation, setReevaluation] =
    useState<CareerProfileReevaluation | null>(null);
  const [reevaluationPollCount, setReevaluationPollCount] = useState(0);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingClaim, setEditingClaim] = useState<string | null>(null);
  const [evidenceAction, setEvidenceAction] = useState<{
    claimId: string;
    transitionTo?: CandidateClaimState;
    state: ManualEvidenceInput['state'];
  } | null>(null);
  const [replacementClaim, setReplacementClaim] = useState<string | null>(null);
  const [retiringClaim, setRetiringClaim] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCareerMemory()
      .then((value) => {
        if (active) {
          setLoadError(null);
          setProfile(value);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Your Career Profile could not be loaded.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [getCareerMemory, reload]);

  useEffect(() => {
    if (!reevaluation || !['PENDING', 'RUNNING'].includes(reevaluation.state)) {
      return;
    }
    if (reevaluationPollCount >= 30) return;
    const timer = window.setTimeout(() => {
      setReevaluationPollCount((count) => count + 1);
      void getCareerProfileReevaluation(reevaluation.id)
        .then(setReevaluation)
        .catch(() => undefined);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [getCareerProfileReevaluation, reevaluation, reevaluationPollCount]);

  const groups = useMemo(() => groupClaims(profile?.claims ?? []), [profile]);

  async function mutate(action: () => Promise<CareerMemoryProfile>) {
    setSaving(true);
    setMutationError(null);
    try {
      const nextProfile = await action();
      setProfile(nextProfile);
      if (nextProfile.reevaluation) {
        setReevaluationPollCount(0);
        setReevaluation(nextProfile.reevaluation);
      }
      setShowAdd(false);
      setEditingClaim(null);
      setEvidenceAction(null);
      setReplacementClaim(null);
      setRetiringClaim(null);
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : 'Your Career Profile could not be updated.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    const notFound = /404|not found/i.test(loadError);
    return (
      <div className="page profile-page">
        <PageHeader eyebrow="Evidence-backed profile" title="Career Profile" />
        <section className="empty-state" role="alert">
          <h2>
            {notFound
              ? 'Career Profile not found'
              : 'Career Profile unavailable'}
          </h2>
          <p>{loadError}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page profile-page" role="status">
        Loading Career Profile…
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <PageHeader
        description="Keep your factual skills, experience, education, languages, location, and work authorization connected to supporting evidence. Search intent belongs in Discover Jobs under Search Preferences."
        eyebrow="Evidence-backed profile"
        title="Career Profile"
        actions={
          <button type="button" onClick={() => setShowAdd((value) => !value)}>
            Add multiple facts
          </button>
        }
      />

      <section className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          CM
        </span>
        <div>
          <p className="eyebrow">
            {dataSource === 'api'
              ? 'Saved Career Profile'
              : 'Development Career Profile'}
          </p>
          <h2>Your evidence-backed profile</h2>
          <p>
            {profile.claims.length} profile item
            {profile.claims.length === 1 ? '' : 's'} with{' '}
            {profile.claims.reduce(
              (count, claim) => count + claim.evidence.length,
              0,
            )}{' '}
            supporting evidence items
          </p>
          <small>Updated {formatDate(profile.candidate.updatedAt)}</small>
        </div>
      </section>

      {profile.claims.length > 0 ? (
        <section
          className="profile-current-summary"
          aria-labelledby="profile-summary-heading"
        >
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Current state only</p>
              <h2 id="profile-summary-heading">What Rolevia knows about you</h2>
            </div>
          </div>
          <ul>
            {SECTION_ORDER.flatMap((section) => {
              const count = groups.get(section)?.length ?? 0;
              return count > 0
                ? [
                    <li key={section}>
                      <strong>{count}</strong> {section}
                    </li>,
                  ]
                : [];
            })}
          </ul>
          <p>
            {
              profile.claims.filter((claim) => claim.state === 'SUPPORTED')
                .length
            }{' '}
            supported ·{' '}
            {profile.claims.filter((claim) => claim.state === 'UNKNOWN').length}{' '}
            need information ·{' '}
            {
              profile.claims.filter((claim) => claim.state === 'CONFLICTING')
                .length
            }{' '}
            conflicting
          </p>
          <small>
            Missing information can lead Rolevia to investigate. You do not need
            to fill every possible fact.
          </small>
        </section>
      ) : null}

      {reevaluation ? (
        <p className="profile-notice" role="status" aria-live="polite">
          {reevaluationMessage(reevaluation, reevaluationPollCount)}
        </p>
      ) : null}
      {mutationError ? (
        <p className="profile-error" role="alert">
          {mutationError}
        </p>
      ) : null}

      {showAdd ? (
        <BatchClaimForm
          disabled={saving}
          onCancel={() => setShowAdd(false)}
          onSubmit={(inputs) => {
            void mutate(() => createCandidateClaimsBatch(inputs));
          }}
        />
      ) : null}

      {profile.claims.length === 0 ? (
        <EmptyState
          title="Career Profile is empty"
          description="Add a factual profile item and attach evidence when it is available."
        />
      ) : (
        <div className="career-memory-sections">
          {SECTION_ORDER.flatMap((section) => {
            const claims = groups.get(section) ?? [];
            if (claims.length === 0) return [];
            return [
              <section className="profile-section" key={section}>
                <div className="section-heading compact">
                  <h2>{section}</h2>
                </div>
                <div className="career-claim-grid">
                  {claims.map((claim) => (
                    <ClaimCard
                      claim={claim}
                      disabled={saving}
                      editing={editingClaim === claim.id}
                      evidenceAction={
                        evidenceAction?.claimId === claim.id
                          ? evidenceAction
                          : null
                      }
                      replacing={replacementClaim === claim.id}
                      retiring={retiringClaim === claim.id}
                      key={claim.id}
                      onEdit={() => setEditingClaim(claim.id)}
                      onCancelEdit={() => setEditingClaim(null)}
                      onUpdate={(input) => {
                        void mutate(() =>
                          updateCandidateClaim(claim.id, input),
                        );
                      }}
                      onEvidence={(action) =>
                        setEvidenceAction({ claimId: claim.id, ...action })
                      }
                      onCancelEvidence={() => setEvidenceAction(null)}
                      onReplace={() => setReplacementClaim(claim.id)}
                      onCancelReplace={() => setReplacementClaim(null)}
                      onSubmitReplacement={(input) => {
                        void mutate(() =>
                          replaceCandidateClaim(claim.id, input),
                        );
                      }}
                      onRetire={() => setRetiringClaim(claim.id)}
                      onCancelRetire={() => setRetiringClaim(null)}
                      onConfirmRetire={(note) => {
                        void mutate(() => retireCandidateClaim(claim.id, note));
                      }}
                      onAttach={(evidence, transitionTo) => {
                        void mutate(() =>
                          attachClaimEvidence(claim.id, evidence, transitionTo),
                        );
                      }}
                    />
                  ))}
                </div>
              </section>,
            ];
          })}
        </div>
      )}

      {(profile.historicalClaims?.length ?? 0) > 0 ? (
        <details className="profile-history">
          <summary>
            Profile history ({profile.historicalClaims?.length ?? 0})
          </summary>
          <p>
            These facts are preserved for provenance and are not used in current
            opportunity intelligence.
          </p>
          <div className="career-claim-grid">
            {profile.historicalClaims?.map((claim) => (
              <HistoryCard
                claim={claim}
                key={claim.id}
                successor={[
                  ...profile.claims,
                  ...(profile.historicalClaims ?? []),
                ].find(
                  (candidate) => candidate.predecessorClaimId === claim.id,
                )}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ClaimCard(props: {
  readonly claim: CareerMemoryClaim;
  readonly disabled: boolean;
  readonly editing: boolean;
  readonly evidenceAction: {
    transitionTo?: CandidateClaimState;
    state: ManualEvidenceInput['state'];
  } | null;
  readonly replacing: boolean;
  readonly retiring: boolean;
  readonly onEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onUpdate: (input: {
    value: string;
    scope: string | null;
    confidence: 'HIGH' | 'MODERATE' | 'LOW' | null;
  }) => void;
  readonly onEvidence: (action: {
    transitionTo?: CandidateClaimState;
    state: ManualEvidenceInput['state'];
  }) => void;
  readonly onCancelEvidence: () => void;
  readonly onReplace: () => void;
  readonly onCancelReplace: () => void;
  readonly onSubmitReplacement: (input: ReplaceCandidateClaimInput) => void;
  readonly onRetire: () => void;
  readonly onCancelRetire: () => void;
  readonly onConfirmRetire: (note?: string) => void;
  readonly onAttach: (
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ) => void;
}) {
  const mutable =
    props.claim.state !== 'SUPPORTED' && props.claim.state !== 'CONFLICTING';
  return (
    <article
      className="career-claim-card"
      data-claim-state={props.claim.state.toLowerCase()}
    >
      <header>
        <div>
          <span className="evidence-type">{humanize(props.claim.kind)}</span>
          <h3>{props.claim.value}</h3>
        </div>
        <span
          className={`claim-state claim-state-${props.claim.state.toLowerCase()}`}
        >
          {humanize(props.claim.state)}
        </span>
      </header>
      <dl>
        <div>
          <dt>Confidence</dt>
          <dd>
            {props.claim.confidence
              ? humanize(props.claim.confidence)
              : 'Not recorded'}
          </dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>{props.claim.scope ?? 'Not scoped'}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDate(props.claim.updatedAt)}</dd>
        </div>
      </dl>
      {props.claim.successionType ? (
        <p className="claim-guidance">
          {props.claim.successionType === 'CORRECTION'
            ? 'This current fact corrects an earlier profile item.'
            : 'This current fact records professional development from an earlier profile item.'}
        </p>
      ) : null}
      {props.claim.state === 'UNKNOWN' && props.claim.evidence.length === 0 ? (
        <p className="claim-guidance">
          No supported evidence recorded. Unknown is not a negative claim.
        </p>
      ) : null}
      {props.claim.state === 'CONFLICTING' ? (
        <p className="claim-guidance">
          Evidence sources disagree. The contradiction remains unresolved.
        </p>
      ) : null}
      {props.claim.state === 'UNSUPPORTED' ? (
        <p className="claim-guidance">
          This profile item is not supported by reliable evidence.
        </p>
      ) : null}

      <div className="claim-evidence-list">
        <h4>Evidence ({props.claim.evidence.length})</h4>
        {props.claim.evidence.map((item) => (
          <div key={item.id} className="claim-evidence-item">
            <div>
              <strong>{item.evidenceType}</strong>
              <EvidenceStateLabel state={item.state} />
            </div>
            <p>{item.excerpt}</p>
            <small>
              {item.sourceReference} · {formatDate(item.createdAt)}
            </small>
          </div>
        ))}
      </div>

      <div className="claim-actions">
        {mutable ? (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => props.onEdit()}
          >
            Edit profile item
          </button>
        ) : null}
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onReplace()}
        >
          Correct or update
        </button>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onEvidence({ state: 'candidate-confirmed' })}
        >
          Add Evidence
        </button>
        {props.claim.state === 'UNKNOWN' ||
        props.claim.state === 'INFERRED' ||
        props.claim.state === 'UNSUPPORTED' ? (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() =>
              props.onEvidence({
                state: 'candidate-confirmed',
                transitionTo: 'SUPPORTED',
              })
            }
          >
            Confirm as supported
          </button>
        ) : null}
        {props.claim.state === 'SUPPORTED' ? (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() =>
              props.onEvidence({
                state: 'disputed',
                transitionTo: 'CONFLICTING',
              })
            }
          >
            Record conflict
          </button>
        ) : null}
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onRetire()}
        >
          No longer current
        </button>
      </div>

      {props.editing ? (
        <EditClaimForm
          claim={props.claim}
          disabled={props.disabled}
          onCancel={() => props.onCancelEdit()}
          onSubmit={props.onUpdate}
        />
      ) : null}
      {props.evidenceAction ? (
        <EvidenceForm
          action={props.evidenceAction}
          disabled={props.disabled}
          onCancel={() => props.onCancelEvidence()}
          onSubmit={props.onAttach}
        />
      ) : null}
      {props.replacing ? (
        <ReplacementForm
          claim={props.claim}
          disabled={props.disabled}
          onCancel={props.onCancelReplace}
          onSubmit={props.onSubmitReplacement}
        />
      ) : null}
      {props.retiring ? (
        <RetireForm
          disabled={props.disabled}
          onCancel={props.onCancelRetire}
          onSubmit={props.onConfirmRetire}
        />
      ) : null}
    </article>
  );
}

function fieldString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

type BatchRow = {
  readonly id: number;
  readonly kind: string;
  readonly value: string;
  readonly scope: string;
  readonly state: 'UNKNOWN' | 'SUPPORTED';
  readonly confidence: '' | 'HIGH' | 'MODERATE' | 'LOW';
  readonly evidence: string;
};

function emptyBatchRow(id: number): BatchRow {
  return {
    id,
    kind: '',
    value: '',
    scope: '',
    state: 'UNKNOWN',
    confidence: '',
    evidence: '',
  };
}

function BatchClaimForm(props: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: readonly CreateCandidateClaimInput[]) => void;
}) {
  const nextId = useRef(2);
  const [rows, setRows] = useState<readonly BatchRow[]>([emptyBatchRow(1)]);
  const [reviewing, setReviewing] = useState(false);

  function updateRow(id: number, patch: Partial<BatchRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    props.onSubmit(
      rows.map((row) => ({
        kind: row.kind.trim(),
        value: row.value.trim(),
        ...(row.scope.trim() ? { scope: row.scope.trim() } : {}),
        state: row.state,
        ...(row.confidence ? { confidence: row.confidence } : {}),
        ...(row.state === 'SUPPORTED'
          ? {
              evidence: {
                evidenceType: 'user-confirmed statement',
                excerpt: row.evidence.trim(),
                state: 'candidate-confirmed' as const,
              },
            }
          : {}),
      })),
    );
  }
  return (
    <form className="profile-editor" onSubmit={submit}>
      <div>
        <div>
          <h2>
            {reviewing ? 'Review facts before saving' : 'Add multiple facts'}
          </h2>
          <p>
            Unknown is allowed. Supported facts require your confirmation and
            will keep that evidence attached.
          </p>
        </div>
      </div>
      {reviewing ? (
        <div className="batch-review" aria-label="Facts ready to save">
          {rows.map((row) => (
            <article key={row.id}>
              <strong>{row.value}</strong>
              <span>
                {humanize(row.kind)} · {humanize(row.state)}
              </span>
              {row.scope ? <span>Scope: {row.scope}</span> : null}
              {row.evidence ? <p>{row.evidence}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="batch-rows">
          {rows.map((row, index) => (
            <fieldset className="batch-row" key={row.id}>
              <legend>Fact {index + 1}</legend>
              <label>
                Profile category
                <input
                  value={row.kind}
                  onChange={(event) =>
                    updateRow(row.id, { kind: event.target.value })
                  }
                  required
                  placeholder="skill, project, language…"
                />
              </label>
              <label>
                Fact
                <input
                  value={row.value}
                  onChange={(event) =>
                    updateRow(row.id, { value: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Scope
                <input
                  value={row.scope}
                  onChange={(event) =>
                    updateRow(row.id, { scope: event.target.value })
                  }
                  placeholder="Proficiency, geography, duration…"
                />
              </label>
              <label>
                What Rolevia knows
                <select
                  value={row.state}
                  onChange={(event) =>
                    updateRow(row.id, {
                      state: event.target.value as BatchRow['state'],
                    })
                  }
                >
                  <option value="UNKNOWN">Needs information</option>
                  <option value="SUPPORTED">
                    Supported by my confirmation
                  </option>
                </select>
              </label>
              <label>
                Confidence
                <select
                  value={row.confidence}
                  onChange={(event) =>
                    updateRow(row.id, {
                      confidence: event.target.value as BatchRow['confidence'],
                    })
                  }
                >
                  <option value="">Not recorded</option>
                  <option value="HIGH">High</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="LOW">Low</option>
                </select>
              </label>
              {row.state === 'SUPPORTED' ? (
                <label className="batch-evidence-field">
                  Your supporting statement
                  <textarea
                    value={row.evidence}
                    onChange={(event) =>
                      updateRow(row.id, { evidence: event.target.value })
                    }
                    required
                  />
                </label>
              ) : null}
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.id !== row.id),
                    )
                  }
                >
                  Remove fact {index + 1}
                </button>
              ) : null}
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                emptyBatchRow(nextId.current++),
              ])
            }
          >
            Add another fact
          </button>
        </div>
      )}
      <div>
        <button disabled={props.disabled} type="submit">
          {reviewing
            ? `Save ${rows.length} fact${rows.length === 1 ? '' : 's'}`
            : 'Review facts'}
        </button>
        {reviewing ? (
          <button type="button" onClick={() => setReviewing(false)}>
            Back to editing
          </button>
        ) : null}
        <button type="button" onClick={() => props.onCancel()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditClaimForm(props: {
  readonly claim: CareerMemoryClaim;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: {
    value: string;
    scope: string | null;
    confidence: 'HIGH' | 'MODERATE' | 'LOW' | null;
  }) => void;
}) {
  return (
    <form
      className="profile-editor compact"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const confidence = fieldString(data, 'confidence');
        props.onSubmit({
          value: fieldString(data, 'value'),
          scope: fieldString(data, 'scope').trim() || null,
          confidence: (confidence || null) as
            'HIGH' | 'MODERATE' | 'LOW' | null,
        });
      }}
    >
      <label>
        Details
        <input name="value" defaultValue={props.claim.value} required />
      </label>
      <label>
        Scope
        <input name="scope" defaultValue={props.claim.scope ?? ''} />
      </label>
      <label>
        Confidence
        <select name="confidence" defaultValue={props.claim.confidence ?? ''}>
          <option value="">Not recorded</option>
          <option value="HIGH">High</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
        </select>
      </label>
      <div>
        <button disabled={props.disabled} type="submit">
          Save changes
        </button>
        <button type="button" onClick={() => props.onCancel()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReplacementForm(props: {
  readonly claim: CareerMemoryClaim;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: ReplaceCandidateClaimInput) => void;
}) {
  const [changeType, setChangeType] = useState<'CORRECTION' | 'DEVELOPMENT'>(
    'CORRECTION',
  );
  const [state, setState] = useState<'UNKNOWN' | 'SUPPORTED'>(
    props.claim.state === 'SUPPORTED' ? 'SUPPORTED' : 'UNKNOWN',
  );
  return (
    <form
      className="profile-editor compact"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const confidence = fieldString(data, 'confidence');
        const evidence = fieldString(data, 'evidence').trim();
        const note = fieldString(data, 'note').trim();
        props.onSubmit({
          changeType,
          value: fieldString(data, 'value'),
          scope: fieldString(data, 'scope').trim() || null,
          state,
          confidence: (confidence || null) as
            'HIGH' | 'MODERATE' | 'LOW' | null,
          ...(state === 'SUPPORTED'
            ? {
                evidence: {
                  evidenceType: 'user-confirmed statement',
                  excerpt: evidence,
                  state: 'candidate-confirmed',
                },
              }
            : {}),
          ...(note ? { note } : {}),
        });
      }}
    >
      <fieldset>
        <legend>Why is this changing?</legend>
        <label>
          <input
            checked={changeType === 'CORRECTION'}
            name={`change-${props.claim.id}`}
            onChange={() => setChangeType('CORRECTION')}
            type="radio"
          />
          Correction — the previous information was wrong
        </label>
        <label>
          <input
            checked={changeType === 'DEVELOPMENT'}
            name={`change-${props.claim.id}`}
            onChange={() => setChangeType('DEVELOPMENT')}
            type="radio"
          />
          Professional development — the previous information was true and has
          changed
        </label>
      </fieldset>
      <p className="claim-guidance">
        The current fact and its Evidence will move to Profile history. Nothing
        is overwritten.
      </p>
      <label>
        Updated fact
        <input name="value" defaultValue={props.claim.value} required />
      </label>
      <label>
        Updated scope
        <input name="scope" defaultValue={props.claim.scope ?? ''} />
      </label>
      <label>
        What Rolevia knows now
        <select
          value={state}
          onChange={(event) =>
            setState(event.target.value as 'UNKNOWN' | 'SUPPORTED')
          }
        >
          <option value="UNKNOWN">Needs information</option>
          <option value="SUPPORTED">Supported by my confirmation</option>
        </select>
      </label>
      <label>
        Confidence
        <select name="confidence" defaultValue={props.claim.confidence ?? ''}>
          <option value="">Not recorded</option>
          <option value="HIGH">High</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
        </select>
      </label>
      {state === 'SUPPORTED' ? (
        <label>
          Supporting statement for the updated fact
          <textarea name="evidence" required />
        </label>
      ) : null}
      <label>
        Note about this change (optional)
        <textarea
          name="note"
          placeholder="Why the correction or development update was made"
        />
      </label>
      <div>
        <button disabled={props.disabled} type="submit">
          Confirm {changeType === 'CORRECTION' ? 'correction' : 'update'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RetireForm(props: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (note?: string) => void;
}) {
  return (
    <form
      className="profile-editor compact"
      onSubmit={(event) => {
        event.preventDefault();
        const note = fieldString(
          new FormData(event.currentTarget),
          'note',
        ).trim();
        props.onSubmit(note || undefined);
      }}
    >
      <h4>Mark this fact no longer current?</h4>
      <p className="claim-guidance">
        It will leave your current profile and remain in history. This does not
        assert that the opposite is true.
      </p>
      <label>
        Note (optional)
        <textarea name="note" placeholder="Why this is no longer current" />
      </label>
      <div>
        <button disabled={props.disabled} type="submit">
          Confirm no longer current
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EvidenceForm(props: {
  readonly action: {
    transitionTo?: CandidateClaimState;
    state: ManualEvidenceInput['state'];
  };
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ) => void;
}) {
  return (
    <form
      className="profile-editor compact"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const source = fieldString(data, 'source').trim();
        props.onSubmit(
          {
            evidenceType: fieldString(data, 'type'),
            ...(source ? { sourceReference: source } : {}),
            excerpt: fieldString(data, 'excerpt'),
            state: props.action.state,
          },
          props.action.transitionTo,
        );
      }}
    >
      <h4>
        {props.action.transitionTo === 'SUPPORTED'
          ? 'Confirm with Evidence'
          : props.action.transitionTo === 'CONFLICTING'
            ? 'Record contradictory Evidence'
            : 'Attach Evidence'}
      </h4>
      <label>
        Evidence type
        <input
          name="type"
          required
          defaultValue={
            props.action.state === 'candidate-confirmed'
              ? 'user-confirmed statement'
              : 'manual reference'
          }
        />
      </label>
      {props.action.state !== 'candidate-confirmed' ? (
        <label>
          Source / provenance
          <input name="source" required />
        </label>
      ) : null}
      <label>
        Evidence excerpt or value
        <textarea name="excerpt" required />
      </label>
      <div>
        <button disabled={props.disabled} type="submit">
          Attach Evidence
        </button>
        <button type="button" onClick={() => props.onCancel()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function groupClaims(claims: readonly CareerMemoryClaim[]) {
  const grouped = new Map<string, CareerMemoryClaim[]>();
  for (const claim of claims) {
    const section = claimSection(claim.kind);
    grouped.set(section, [...(grouped.get(section) ?? []), claim]);
  }
  return grouped;
}

function HistoryCard({
  claim,
  successor,
}: {
  readonly claim: CareerMemoryClaim;
  readonly successor: CareerMemoryClaim | undefined;
}) {
  return (
    <article className="career-claim-card historical-claim-card">
      <header>
        <div>
          <span className="evidence-type">{humanize(claim.kind)}</span>
          <h3>{claim.value}</h3>
        </div>
        <span className="claim-state">
          {claim.lifecycleState === 'RETIRED'
            ? 'No longer current'
            : successor?.successionType === 'CORRECTION'
              ? 'Corrected'
              : 'Updated'}
        </span>
      </header>
      {claim.scope ? <p>Scope: {claim.scope}</p> : null}
      {successor?.successionNote ? <p>{successor.successionNote}</p> : null}
      <small>
        Current until{' '}
        {claim.endedAt ? formatDate(claim.endedAt) : 'recorded change'}
      </small>
      <div className="claim-evidence-list">
        <h4>Historical Evidence ({claim.evidence.length})</h4>
        {claim.evidence.map((evidence) => (
          <div className="claim-evidence-item" key={evidence.id}>
            <div>
              <strong>{evidence.evidenceType}</strong>
              <EvidenceStateLabel state={evidence.state} />
            </div>
            <p>{evidence.excerpt}</p>
            <small>{evidence.sourceReference}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function reevaluationMessage(
  reevaluation: CareerProfileReevaluation,
  pollCount: number,
): string {
  if (reevaluation.state === 'SUCCEEDED') {
    return `Career Profile saved. Reevaluation completed for ${reevaluation.taskCount} current ${reevaluation.taskCount === 1 ? 'opportunity' : 'opportunities'}.`;
  }
  if (reevaluation.state === 'FAILED') {
    return `Career Profile saved, but reevaluation failed for ${reevaluation.failedTaskCount} current ${reevaluation.failedTaskCount === 1 ? 'opportunity' : 'opportunities'}.`;
  }
  if (pollCount >= 30) {
    return 'Career Profile saved. Reevaluation is still pending; it will continue in the background.';
  }
  return reevaluation.state === 'RUNNING'
    ? `Career Profile saved. Reevaluation is running (${reevaluation.completedTaskCount} of ${reevaluation.taskCount} completed).`
    : 'Career Profile saved. Reevaluation is pending for current opportunities.';
}

function claimSection(kind: string): (typeof SECTION_ORDER)[number] {
  const normalized = kind.toLowerCase();
  if (/skill|competency|technology/.test(normalized)) return 'Skills';
  if (/experience|project|capability|tenure|seniority/.test(normalized))
    return 'Experience and projects';
  if (/education|certification/.test(normalized))
    return 'Education and certifications';
  if (/language/.test(normalized)) return 'Languages';
  if (
    /location|authorization|citizenship|sponsorship|clearance/.test(normalized)
  )
    return 'Location and work authorization';
  return 'Other profile information';
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export default ProfilePage;
