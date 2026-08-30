import { useEffect, useMemo, useState, type FormEvent } from 'react';

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
} from '../../data/types.js';

const SECTION_ORDER = [
  'Skills',
  'Experience and projects',
  'Education and certifications',
  'Languages',
  'Location and work authorization',
  'Preferences',
  'Other Career Memory',
] as const;

export function ProfilePage() {
  const {
    dataSource,
    getCareerMemory,
    createCandidateClaim,
    updateCandidateClaim,
    attachClaimEvidence,
  } = useProductData();
  const [profile, setProfile] = useState<CareerMemoryProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingClaim, setEditingClaim] = useState<string | null>(null);
  const [evidenceAction, setEvidenceAction] = useState<{
    claimId: string;
    transitionTo?: CandidateClaimState;
    state: ManualEvidenceInput['state'];
  } | null>(null);

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
              : 'Career Memory could not be loaded.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [getCareerMemory, reload]);

  const groups = useMemo(() => groupClaims(profile?.claims ?? []), [profile]);

  async function mutate(action: () => Promise<CareerMemoryProfile>) {
    setSaving(true);
    setMutationError(null);
    try {
      setProfile(await action());
      setReevaluating(dataSource === 'api');
      setShowAdd(false);
      setEditingClaim(null);
      setEvidenceAction(null);
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : 'Career Memory could not be updated.',
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
            {notFound ? 'Candidate not found' : 'Career Memory unavailable'}
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
        Loading Career Memory…
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <PageHeader
        description="Career Memory keeps candidate claims connected to their scope, epistemic state, and supporting Evidence."
        eyebrow="Evidence-backed profile"
        title="Career Profile"
        actions={
          <button type="button" onClick={() => setShowAdd((value) => !value)}>
            Add claim
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
              ? 'Persisted Career Memory'
              : 'Seed Career Memory'}
          </p>
          <h2>Development candidate</h2>
          <strong>{profile.candidate.id}</strong>
          <p>
            {profile.claims.length} claim
            {profile.claims.length === 1 ? '' : 's'} with{' '}
            {profile.claims.reduce(
              (count, claim) => count + claim.evidence.length,
              0,
            )}{' '}
            linked Evidence items
          </p>
          <small>Updated {formatDate(profile.candidate.updatedAt)}</small>
        </div>
      </section>

      {reevaluating ? (
        <p className="profile-notice" role="status">
          Career Memory saved. Re-evaluating affected opportunities through the
          background worker…
        </p>
      ) : null}
      {mutationError ? (
        <p className="profile-error" role="alert">
          {mutationError}
        </p>
      ) : null}

      {showAdd ? (
        <ClaimForm
          disabled={saving}
          onCancel={() => setShowAdd(false)}
          onSubmit={(input) => {
            void mutate(() => createCandidateClaim(input));
          }}
        />
      ) : null}

      {profile.claims.length === 0 ? (
        <EmptyState
          title="Career Memory is empty"
          description="Add an unknown claim or a supported claim with candidate-confirmed Evidence."
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
          {props.claim.state}
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
          This claim is not trusted Career Memory.
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
            Edit claim
          </button>
        ) : null}
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
    </article>
  );
}

function fieldString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}

function ClaimForm(props: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: CreateCandidateClaimInput) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const state = fieldString(data, 'state') as 'UNKNOWN' | 'SUPPORTED';
    const excerpt = fieldString(data, 'evidence').trim();
    const scope = fieldString(data, 'scope').trim();
    const confidence = fieldString(data, 'confidence');
    props.onSubmit({
      kind: fieldString(data, 'kind'),
      value: fieldString(data, 'value'),
      ...(scope ? { scope } : {}),
      state,
      ...(confidence
        ? {
            confidence: confidence as 'HIGH' | 'MODERATE' | 'LOW',
          }
        : {}),
      ...(state === 'SUPPORTED'
        ? {
            evidence: {
              evidenceType: 'user-confirmed statement',
              excerpt,
              state: 'candidate-confirmed',
            },
          }
        : {}),
    });
  }
  return (
    <form className="profile-editor" onSubmit={submit}>
      <h2>Add Career Memory claim</h2>
      <label>
        Claim kind
        <input
          name="kind"
          required
          placeholder="skill, language, work_authorization…"
        />
      </label>
      <label>
        Claim value
        <input name="value" required />
      </label>
      <label>
        Scope
        <input name="scope" placeholder="US, German, current geography…" />
      </label>
      <label>
        State
        <select name="state" defaultValue="UNKNOWN">
          <option value="UNKNOWN">Unknown</option>
          <option value="SUPPORTED">Supported with confirmation</option>
        </select>
      </label>
      <label>
        Confidence
        <select name="confidence" defaultValue="">
          <option value="">Not recorded</option>
          <option value="HIGH">High</option>
          <option value="MODERATE">Moderate</option>
          <option value="LOW">Low</option>
        </select>
      </label>
      <label>
        Candidate-confirmed statement
        <textarea
          name="evidence"
          placeholder="Required when creating a supported claim"
        />
      </label>
      <div>
        <button disabled={props.disabled} type="submit">
          Save claim
        </button>
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
        Claim value
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
  if (/preference|target/.test(normalized)) return 'Preferences';
  return 'Other Career Memory';
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
