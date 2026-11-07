import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  ApiClientError,
  isSafeHttpUrl,
  RoleviaApiClient,
} from '@oca/api-client';
import {
  ManualOpportunityDuplicateSchema,
  type ManualOpportunityDetailSchema,
  type ManualOpportunityRecordSchema,
  type ManualOpportunityRequestSchema,
} from '@oca/schemas';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { beforeWorkspaceSignOut, useAuth } from '../../app/authContext.js';
import { useProductData } from '../../app/ProductDataProvider.js';
import { EmptyState } from '../../components/EmptyState.js';
import { PageHeader } from '../../components/PageHeader.js';
import { browserConfig } from '../../config.js';
import './saved-opportunities.css';

const base = '/saved-opportunities';
const categories = {
  JOB: 'Job',
  INTERNSHIP: 'Internship',
  FREELANCE_CONTRACT: 'Freelance contract',
  FELLOWSHIP: 'Fellowship',
  GRANT: 'Grant',
  COMPETITION: 'Competition',
  HACKATHON: 'Hackathon',
} as const;
type Input = Static<typeof ManualOpportunityRequestSchema>;
type Record = Static<typeof ManualOpportunityRecordSchema>;
type Detail = Static<typeof ManualOpportunityDetailSchema>;
type Duplicate = Static<typeof ManualOpportunityDuplicateSchema>;
type Draft = {
  category: Input['category'];
  title: string;
  organization: string;
  sourceUrl: string;
  sourceContext: string;
  deadline: string;
};
const empty: Draft = {
  category: 'JOB',
  title: '',
  organization: '',
  sourceUrl: '',
  sourceContext: '',
  deadline: '',
};
type Attempt = { key: string; input: Input; version?: number };

function useManualContext() {
  const { candidateId, cloud } = useAuth();
  const { dataSource } = useProductData();
  const api = useMemo(
    () =>
      new RoleviaApiClient({
        baseUrl: browserConfig.apiBaseUrl,
        credentialProvider: () => ({
          credentials: cloud ? 'include' : 'same-origin',
        }),
      }),
    [cloud],
  );
  return {
    api,
    candidate: dataSource === 'api' ? candidateId : undefined,
    demo: dataSource === 'seed',
  };
}
type Context = ReturnType<typeof useManualContext> & { candidate: string };
function Authorized({
  children,
}: {
  children: (context: Context) => ReactNode;
}) {
  const context = useManualContext();
  if (!context.candidate)
    return (
      <Frame title="Saved Opportunities">
        <EmptyState
          title={
            context.demo ? 'Demo workspace' : 'Workspace identity required'
          }
          description={
            context.demo
              ? 'Saved Opportunities are available in your personal workspace. This demo does not access personal records.'
              : 'Open your configured personal workspace or sign in to access saved opportunities.'
          }
          action={{ label: 'Back to Overview', to: '/overview' }}
        />
      </Frame>
    );
  return (
    <div key={context.candidate}>
      {children({ ...context, candidate: context.candidate })}
    </div>
  );
}
function Frame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heading = section.current?.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }, [title]);
  return (
    <div className="page saved-opportunities" ref={section}>
      <PageHeader
        eyebrow="Personal workspace"
        title={title}
        actions={actions}
      />
      {children}
    </div>
  );
}
function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    notice.current?.focus();
  }, [message]);
  return (
    <div className="saved-notice">
      <p role="alert" tabIndex={-1} ref={notice}>
        {message}
      </p>
      {retry && (
        <button className="button button-secondary" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data?: T; failed?: boolean }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data });
      },
      () => {
        if (!controller.signal.aborted) setState({ failed: true });
      },
    );
    return () => controller.abort();
  }, [load, retry]);
  return {
    ...state,
    retry: () => {
      setState({});
      setRetry((value) => value + 1);
    },
  };
}

export function SavedListPage() {
  return <Authorized>{(context) => <SavedList {...context} />}</Authorized>;
}
function SavedList({ api, candidate }: Context) {
  const load = useMemo(
    () => (signal: AbortSignal) =>
      api.listManualOpportunities(candidate, undefined, { signal }),
    [api, candidate],
  );
  const state = useLoad(load);
  const [extra, setExtra] = useState<Record[]>([]);
  const [cursor, setCursor] = useState<string | null>();
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState(false);
  const next = cursor === undefined ? state.data?.nextCursor : cursor;
  async function more() {
    if (!next || paging) return;
    setPaging(true);
    setError(false);
    try {
      const page = await api.listManualOpportunities(candidate, next);
      setExtra((items) => [...items, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setPaging(false);
    }
  }
  return (
    <Frame
      title="Saved Opportunities"
      actions={
        <Link to={base + '/new'} className="button button-primary">
          Add opportunity
        </Link>
      }
    >
      {state.failed ? (
        <ErrorNotice
          message="Saved opportunities are unavailable."
          retry={state.retry}
        />
      ) : !state.data ? (
        <p role="status">Loading saved opportunities…</p>
      ) : !state.data.items.length ? (
        <EmptyState
          title="No saved opportunities yet"
          description="Capture an opportunity from a link, email, referral, or another source."
        />
      ) : (
        <ul className="saved-list">
          {[...state.data.items, ...extra].map((item) => (
            <li key={item.id} className="saved-panel">
              <p className="eyebrow">{categories[item.category]}</p>
              <h2>
                <Link to={base + '/' + item.id}>{item.title}</Link>
              </h2>
              <p>{item.organization}</p>
              <p className="saved-meta">
                Manually entered · unverified · Not evaluated
              </p>
              {item.deadline && (
                <p>
                  Deadline <time dateTime={item.deadline}>{item.deadline}</time>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorNotice message="Could not load more opportunities." />}
      {next && (
        <button
          className="button button-secondary"
          disabled={paging}
          onClick={() => void more()}
        >
          {paging ? 'Loading…' : 'Load more'}
        </button>
      )}
    </Frame>
  );
}
export function SavedDetailPage() {
  const { opportunityId = '' } = useParams();
  return (
    <Authorized>
      {(context) => (
        <SavedRecord key={opportunityId} {...context} id={opportunityId} />
      )}
    </Authorized>
  );
}
export function SavedEditPage() {
  const { opportunityId = '' } = useParams();
  return (
    <Authorized>
      {(context) => (
        <SavedRecord key={opportunityId} {...context} id={opportunityId} edit />
      )}
    </Authorized>
  );
}
export function SavedNewPage() {
  return <Authorized>{(context) => <CaptureForm {...context} />}</Authorized>;
}
function SavedRecord({
  id,
  edit,
  ...context
}: Context & { id: string; edit?: boolean }) {
  const { api, candidate } = context;
  const load = useMemo(
    () => (signal: AbortSignal) =>
      api.getManualOpportunity(candidate, id, { signal }),
    [api, candidate, id],
  );
  const state = useLoad(load);
  if (!state.data)
    return (
      <Frame title={edit ? 'Edit opportunity' : 'Saved opportunity'}>
        {state.failed ? (
          <ErrorNotice
            message="This saved opportunity could not be opened."
            retry={state.retry}
          />
        ) : (
          <p role="status">Loading opportunity…</p>
        )}
        <Link to={base}>Back to saved opportunities</Link>
      </Frame>
    );
  const record = state.data;
  if (edit) return <CaptureForm {...context} record={record} />;
  return (
    <Frame
      title={record.title}
      actions={
        <Link to={base + '/' + id + '/edit'} className="button button-primary">
          Edit opportunity
        </Link>
      }
    >
      <Link to={base}>Back to saved opportunities</Link>
      <section className="saved-panel saved-detail">
        <p className="eyebrow">{categories[record.category]}</p>
        <h2>{record.organization}</h2>
        <p className="saved-meta">Manually entered · unverified</p>
        <p className="saved-meta">Not evaluated</p>
        <dl>
          <dt>Source URL</dt>
          <dd>
            {record.sourceUrl && isSafeHttpUrl(record.sourceUrl) ? (
              <a
                href={record.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {record.sourceUrl}
              </a>
            ) : (
              'No source URL'
            )}
          </dd>
          <dt>Source context</dt>
          <dd>{record.sourceContext ?? 'None provided'}</dd>
          <dt>Deadline</dt>
          <dd>
            {record.deadline ? (
              <time dateTime={record.deadline}>{record.deadline}</time>
            ) : (
              'No deadline'
            )}
          </dd>
        </dl>
      </section>
      <details className="saved-panel">
        <summary>Revision history</summary>
        <ol>
          {record.revisions.map((revision) => (
            <li key={revision.version}>
              Revision {revision.version} ·{' '}
              <time dateTime={revision.observedAt}>
                {new Date(revision.observedAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </details>
    </Frame>
  );
}
const fromRecord = (record: Detail): Draft => ({
  category: record.category,
  title: record.title,
  organization: record.organization,
  sourceUrl: record.sourceUrl ?? '',
  sourceContext: record.sourceContext ?? '',
  deadline: record.deadline ?? '',
});
function duplicateError(error: ApiClientError): Duplicate | null {
  if (error.statusCode !== 409) return null;
  const info = (error.details as { error?: { code?: string } } | undefined)
    ?.error;
  return info?.code === 'DUPLICATE' &&
    Value.Check(ManualOpportunityDuplicateSchema, info)
    ? info
    : null;
}
function dateToday() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
function validate(draft: Draft) {
  if (!draft.title.trim() || !draft.organization.trim())
    return 'Enter a title and organization.';
  if (!draft.sourceUrl.trim() && !draft.sourceContext.trim())
    return 'Enter a source URL or tell us where you found this opportunity.';
  if (
    draft.sourceUrl.trim() &&
    (!/^https?:\/\//i.test(draft.sourceUrl.trim()) ||
      !isSafeHttpUrl(draft.sourceUrl.trim()))
  )
    return 'Enter a valid HTTP or HTTPS source URL.';
  if (draft.deadline) {
    const date = new Date(draft.deadline + 'T00:00:00Z');
    if (
      !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(draft.deadline) ||
      !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== draft.deadline
    )
      return 'Enter a valid calendar date.';
  }
  return '';
}
function Confirm({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const modal = dialog.current;
    const previous = document.activeElement;
    modal?.showModal();
    cancel.current?.focus();
    return () => {
      if (modal?.open) modal.close();
      if (
        document.activeElement === document.body &&
        previous instanceof HTMLElement &&
        previous.isConnected
      )
        previous.focus();
    };
  }, []);
  return (
    <dialog
      className="saved-dialog"
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      {children}
      <button
        ref={cancel}
        className="button button-secondary"
        onClick={onCancel}
      >
        Go back
      </button>
    </dialog>
  );
}

function CaptureForm({
  api,
  candidate,
  record,
}: Context & { record?: Detail }) {
  const [baseline, setBaseline] = useState(() =>
    record ? fromRecord(record) : empty,
  );
  const [draft, setDraft] = useState(baseline);
  const [version, setVersion] = useState(record?.version);
  const [latest, setLatest] = useState<Detail>();
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uncertain, setUncertain] = useState<Attempt>();
  const [duplicate, setDuplicate] = useState<Duplicate>();
  const [confirm, setConfirm] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { signOut } = useAuth();
  const active = useRef(false);
  const leaving = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const navigate = useNavigate();
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const blocker = useBlocker(
    () => !leaving.current && (dirty || Boolean(uncertain) || active.current),
  );
  useEffect(() => {
    const guard = (event: Event) => {
      if (!dirty && !uncertain && !active.current) return;
      event.preventDefault();
      setConfirmSignOut(true);
    };
    window.addEventListener(beforeWorkspaceSignOut, guard);
    return () => window.removeEventListener(beforeWorkspaceSignOut, guard);
  }, [dirty, uncertain]);
  useBeforeUnload((event) => {
    if (!leaving.current && (dirty || uncertain || active.current)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  const back = record ? base + '/' + record.id : base;
  function update(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDuplicate(undefined);
    setMessage('');
  }
  async function save(attempt: Attempt) {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setMessage('');
    setDuplicate(undefined);
    try {
      const saved =
        record && attempt.version !== undefined
          ? await api.editManualOpportunity(
              candidate,
              record.id,
              attempt.version,
              attempt.input,
            )
          : (
              await api.createManualOpportunity(
                candidate,
                attempt.key,
                attempt.input,
              )
            ).record;
      if (!alive.current) return;
      leaving.current = true;
      void navigate(base + '/' + saved.id, { replace: true });
    } catch (error) {
      if (!alive.current) return;
      const known =
        error instanceof ApiClientError &&
        error.statusCode !== undefined &&
        [400, 401, 403, 404, 409, 412, 422, 428].includes(error.statusCode);
      setUncertain(known ? undefined : attempt);
      if (error instanceof ApiClientError) {
        const match = duplicateError(error);
        if (match) {
          setDuplicate(match);
          setMessage('Review possible duplicates before saving.');
          return;
        }
        if (error.statusCode === 412) {
          setStale(true);
          setMessage(
            'This opportunity changed elsewhere. Reload the latest revision before applying your draft.',
          );
          return;
        }
      }
      setMessage(
        known
          ? 'The opportunity could not be saved. Check your draft and access.'
          : 'The save result is unknown. Retry the same request to confirm what happened.',
      );
    } finally {
      active.current = false;
      if (alive.current) setPending(false);
    }
  }
  function submit(
    event?: FormEvent<HTMLFormElement>,
    acknowledgement?: string,
  ) {
    event?.preventDefault();
    if (active.current || uncertain || stale) return;
    const error = validate(draft);
    if (error) {
      setMessage(error);
      return;
    }
    const input: Input = {
      ...draft,
      title: draft.title.trim(),
      organization: draft.organization.trim(),
      sourceUrl: draft.sourceUrl.trim() || null,
      sourceContext: draft.sourceContext.trim() || null,
      deadline: draft.deadline || null,
      ...(acknowledgement ? { acknowledgement } : {}),
    };
    void save({
      key: crypto.randomUUID(),
      input,
      ...(version !== undefined ? { version } : {}),
    });
  }
  async function reload() {
    if (!record || checking) return;
    setChecking(true);
    try {
      setLatest(await api.getManualOpportunity(candidate, record.id));
      setMessage(
        'Latest revision loaded. Review it before reapplying your draft.',
      );
    } catch {
      setMessage(
        'Could not load the latest revision. Your draft is still here.',
      );
    } finally {
      setChecking(false);
    }
  }
  return (
    <Frame title={record ? 'Edit opportunity' : 'Add opportunity'}>
      <Link to={back}>
        Back to {record ? 'opportunity' : 'saved opportunities'}
      </Link>
      <form className="saved-panel saved-form" onSubmit={submit}>
        <fieldset disabled={pending || Boolean(uncertain)}>
          <legend>Opportunity details</legend>
          <label>
            Category
            <select
              value={draft.category}
              onChange={(event) => update('category', event.target.value)}
            >
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
            />
          </label>
          <label>
            Organization
            <input
              required
              maxLength={200}
              value={draft.organization}
              onChange={(event) => update('organization', event.target.value)}
            />
          </label>
          <label>
            Source URL (optional)
            <input
              type="url"
              maxLength={2048}
              value={draft.sourceUrl}
              onChange={(event) => update('sourceUrl', event.target.value)}
            />
          </label>
          <div className="saved-field">
            <label htmlFor="saved-source-context">Source context</label>
            <textarea
              id="saved-source-context"
              required={!draft.sourceUrl.trim()}
              maxLength={1000}
              aria-describedby="saved-context-hint"
              value={draft.sourceContext}
              onChange={(event) => update('sourceContext', event.target.value)}
            />
          </div>
          <p id="saved-context-hint" className="saved-meta">
            Required when there is no URL. For example, an email or referral.
          </p>
          <label>
            Deadline (optional)
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={draft.deadline}
              onChange={(event) => update('deadline', event.target.value)}
            />
          </label>
          {draft.deadline && draft.deadline < dateToday() && (
            <p role="status">
              This deadline has passed. You can still save the opportunity.
            </p>
          )}
        </fieldset>
        {message && <ErrorNotice message={message} />}
        {duplicate && (
          <section aria-label="Possible duplicates" className="saved-notice">
            <ul>
              {duplicate.matches.map((match) => (
                <li key={match.id}>
                  {match.title} · {match.organization}{' '}
                  <Link
                    to={
                      match.kind === 'ATS'
                        ? '/discover/' + encodeURIComponent(match.id)
                        : base + '/' + encodeURIComponent(match.id)
                    }
                  >
                    Open existing
                    <span className="saved-sr-only"> {match.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="saved-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setDuplicate(undefined);
                  setMessage('');
                }}
              >
                Edit draft
              </button>
              {duplicate.acknowledgement && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setConfirm(true)}
                >
                  Save as separate
                </button>
              )}
            </div>
          </section>
        )}
        {stale && (
          <div className="saved-notice">
            <button
              type="button"
              className="button button-secondary"
              disabled={checking}
              onClick={() => void reload()}
            >
              {checking ? 'Loading…' : 'Reload latest revision'}
            </button>
            {latest && (
              <div>
                <p>
                  Revision {latest.version} · {latest.title} ·{' '}
                  {latest.organization}
                </p>
                <p>
                  {latest.sourceContext ||
                    latest.sourceUrl ||
                    'No source context'}{' '}
                  · {latest.deadline || 'No deadline'}
                </p>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={checking}
                  onClick={() => {
                    const newest = fromRecord(latest);
                    const changes = Object.fromEntries(
                      (Object.keys(draft) as (keyof Draft)[])
                        .filter((key) => draft[key] !== baseline[key])
                        .map((key) => [key, draft[key]]),
                    );
                    setDraft({ ...newest, ...changes });
                    setBaseline(newest);
                    setVersion(latest.version);
                    setLatest(undefined);
                    setStale(false);
                    setMessage('');
                  }}
                >
                  Reapply my draft
                </button>
              </div>
            )}
          </div>
        )}
        <div className="saved-actions">
          {uncertain ? (
            <button
              type="button"
              className="button button-primary"
              disabled={pending}
              onClick={() => void save(uncertain)}
            >
              Retry same save
            </button>
          ) : (
            <button
              className="button button-primary"
              disabled={pending || stale || Boolean(duplicate)}
            >
              {record ? 'Save changes' : 'Save opportunity'}
            </button>
          )}
          <Link to={back} className="button button-secondary">
            Cancel
          </Link>
        </div>
        <p role="status">{pending ? 'Saving opportunity…' : ''}</p>
      </form>
      {confirm && (
        <Confirm title="Save as separate?" onCancel={() => setConfirm(false)}>
          <p>
            This will create a separate record or keep your edit separate from
            the matching opportunity.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setConfirm(false);
              submit(undefined, duplicate?.acknowledgement ?? undefined);
            }}
          >
            Confirm separate capture
          </button>
        </Confirm>
      )}
      {confirmSignOut && (
        <Confirm
          title="Sign out with this draft?"
          onCancel={() => setConfirmSignOut(false)}
        >
          <p>
            {pending
              ? 'A save is in progress. Wait for the result before signing out.'
              : 'Signing out will discard the draft and any retry information.'}
          </p>
          {!pending && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                leaving.current = true;
                setConfirmSignOut(false);
                void signOut().catch(() => {
                  leaving.current = false;
                  setMessage('Could not sign out. Your draft is still here.');
                });
              }}
            >
              Discard draft and sign out
            </button>
          )}
        </Confirm>
      )}
      {blocker.state === 'blocked' && (
        <Confirm title="Leave this draft?" onCancel={() => blocker.reset()}>
          <p>
            {pending
              ? 'A save is in progress. Wait for the result before leaving.'
              : uncertain
                ? 'This save may have completed. Leaving will discard your retry information.'
                : 'Your unsaved changes will be discarded.'}
          </p>
          {!pending && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => blocker.proceed()}
            >
              Discard draft and leave
            </button>
          )}
        </Confirm>
      )}
    </Frame>
  );
}
