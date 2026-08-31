import { useEffect, useState } from 'react';

import { useProductData } from '../../app/ProductDataProvider.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DiscoveryRunStatus } from '../../components/Status.js';
import type {
  CreateSearchTargetInput,
  DiscoveryRun,
  SearchTarget,
  SearchTargetSource,
} from '../../data/types.js';

const EMPTY_SOURCE: SearchTargetSource = {
  sourceSystem: 'greenhouse',
  boardId: '',
};

export function SearchPage() {
  const {
    getSearchTargets,
    createSearchTarget,
    updateSearchTarget,
    runDiscovery,
    getDiscoveryRuns,
  } = useProductData();

  const [targets, setTargets] = useState<readonly SearchTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [runs, setRuns] = useState<readonly DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [targetRoles, setTargetRoles] = useState('');
  const [skills, setSkills] = useState('');
  const [locations, setLocations] = useState('');
  const [locationIsHardFilter, setLocationIsHardFilter] = useState(false);
  const [workModels, setWorkModels] = useState<
    ('remote' | 'hybrid' | 'onsite')[]
  >([]);
  const [workModelIsHardFilter, setWorkModelIsHardFilter] = useState(false);
  const [seniorityLevels, setSeniorityLevels] = useState<
    ('internship' | 'entry' | 'junior' | 'mid' | 'senior')[]
  >([]);
  const [seniorityIsHardFilter, setSeniorityIsHardFilter] = useState(false);
  const [employmentTypes, setEmploymentTypes] = useState<
    ('full-time' | 'contract' | 'internship')[]
  >([]);
  const [employmentTypeIsHardFilter, setEmploymentTypeIsHardFilter] =
    useState(false);
  const [requiredTerms, setRequiredTerms] = useState('');
  const [excludedTerms, setExcludedTerms] = useState('');
  const [minSalary, setMinSalary] = useState<number | ''>('');
  const [currency, setCurrency] = useState('');
  const [freshnessDays, setFreshnessDays] = useState(30);
  const [sources, setSources] = useState<readonly SearchTargetSource[]>([
    EMPTY_SOURCE,
  ]);

  // Discovery Run Status Feedback
  const [runStatusNotice, setRunStatusNotice] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([getSearchTargets(), getDiscoveryRuns()])
      .then(([fetchedTargets, fetchedRuns]) => {
        if (!active) return;
        setTargets(fetchedTargets);
        setRuns(fetchedRuns);
        if (fetchedTargets.length > 0 && !selectedTargetId) {
          const t = fetchedTargets[0];
          if (t) {
            setSelectedTargetId(t.id);
            setName(t.name);
            setEnabled(t.enabled);
            setTargetRoles(t.targetRoles.join(', '));
            setSkills(t.skills.join(', '));
            setLocations(t.locations.join(', '));
            setLocationIsHardFilter(t.locationIsHardFilter);
            setWorkModels([...t.workModels]);
            setWorkModelIsHardFilter(t.workModelIsHardFilter);
            setSeniorityLevels([...t.seniorityLevels]);
            setSeniorityIsHardFilter(t.seniorityIsHardFilter);
            setEmploymentTypes([...t.employmentTypes]);
            setEmploymentTypeIsHardFilter(t.employmentTypeIsHardFilter);
            setRequiredTerms(t.requiredTerms.join(', '));
            setExcludedTerms(t.excludedTerms.join(', '));
            setMinSalary(t.minSalary ?? '');
            setCurrency(t.currency ?? 'EUR');
            setFreshnessDays(t.freshnessDays ?? 30);
            setSources(t.sources.length > 0 ? [...t.sources] : [EMPTY_SOURCE]);
          }
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load search configuration.',
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [getSearchTargets, getDiscoveryRuns, selectedTargetId]);

  function populateForm(t: SearchTarget) {
    setSelectedTargetId(t.id);
    setName(t.name);
    setEnabled(t.enabled);
    setTargetRoles(t.targetRoles.join(', '));
    setSkills(t.skills.join(', '));
    setLocations(t.locations.join(', '));
    setLocationIsHardFilter(t.locationIsHardFilter);
    setWorkModels([...t.workModels]);
    setWorkModelIsHardFilter(t.workModelIsHardFilter);
    setSeniorityLevels([...t.seniorityLevels]);
    setSeniorityIsHardFilter(t.seniorityIsHardFilter);
    setEmploymentTypes([...t.employmentTypes]);
    setEmploymentTypeIsHardFilter(t.employmentTypeIsHardFilter);
    setRequiredTerms(t.requiredTerms.join(', '));
    setExcludedTerms(t.excludedTerms.join(', '));
    setMinSalary(t.minSalary ?? '');
    setCurrency(t.currency ?? 'EUR');
    setFreshnessDays(t.freshnessDays ?? 30);
    setSources(t.sources.length > 0 ? [...t.sources] : [EMPTY_SOURCE]);
  }

  function handleNewTarget() {
    setSelectedTargetId(null);
    setName('');
    setEnabled(true);
    setTargetRoles('');
    setSkills('');
    setLocations('');
    setLocationIsHardFilter(false);
    setWorkModels([]);
    setWorkModelIsHardFilter(false);
    setSeniorityLevels([]);
    setSeniorityIsHardFilter(false);
    setEmploymentTypes([]);
    setEmploymentTypeIsHardFilter(false);
    setRequiredTerms('');
    setExcludedTerms('');
    setMinSalary('');
    setCurrency('');
    setFreshnessDays(30);
    setSources([EMPTY_SOURCE]);
  }

  function parseCsv(val: string): string[] {
    return val
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRunStatusNotice(null);

    const normalizedSources = sources.map((source) => ({
      sourceSystem: source.sourceSystem,
      boardId: source.boardId.trim(),
    }));
    const invalidSourceIndex = normalizedSources.findIndex(
      (source) => !source.boardId,
    );
    if (invalidSourceIndex >= 0) {
      setError(`Source ${invalidSourceIndex + 1} requires an identifier.`);
      return;
    }
    const sourceKeys = normalizedSources.map(
      (source) => `${source.sourceSystem}:${source.boardId.toLowerCase()}`,
    );
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      setError('Remove duplicate job sources before saving.');
      return;
    }
    const inputData: CreateSearchTargetInput = {
      name,
      enabled,
      targetRoles: parseCsv(targetRoles),
      skills: parseCsv(skills),
      locations: parseCsv(locations),
      locationIsHardFilter,
      workModels,
      workModelIsHardFilter,
      seniorityLevels,
      seniorityIsHardFilter,
      employmentTypes,
      employmentTypeIsHardFilter,
      minSalary: minSalary === '' ? null : Number(minSalary),
      currency,
      freshnessDays,
      requiredTerms: parseCsv(requiredTerms),
      excludedTerms: parseCsv(excludedTerms),
      sources: normalizedSources,
    };

    try {
      if (selectedTargetId) {
        const updated = await updateSearchTarget(selectedTargetId, inputData);
        populateForm(updated);
        setRunStatusNotice('Search preference updated successfully.');
      } else {
        const created = await createSearchTarget(inputData);
        populateForm(created);
        setRunStatusNotice('New search preference created successfully.');
      }
      const fetchedTargets = await getSearchTargets();
      setTargets(fetchedTargets);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save search preference.',
      );
    }
  }

  async function handleRunDiscovery() {
    if (!selectedTargetId) return;
    const savedTarget = targets.find(
      (target) => target.id === selectedTargetId,
    );
    if (!savedTarget || savedTarget.sources.length === 0) {
      setError(
        'Configure and save at least one valid job source before discovery.',
      );
      return;
    }
    setIsRunning(true);
    setRunStatusNotice('Discovery queued...');
    setError(null);

    try {
      const result = await runDiscovery(selectedTargetId);
      setRunStatusNotice(
        result.run.status === 'COMPLETED'
          ? `Discovery completed. Discovered: ${result.run.discoveredCount}, Accepted: ${result.run.acceptedCount}, Rejected: ${result.run.rejectedCount}`
          : result.run.status === 'FAILED'
            ? `Discovery failed: ${result.run.errorSummary ?? 'No error detail was recorded.'}`
            : `Discovery queued. Current status: ${result.run.status.toLowerCase()}.`,
      );
      const updatedRuns = await getDiscoveryRuns();
      setRuns(updatedRuns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job search failed.');
      setRunStatusNotice('Discovery failed.');
    } finally {
      setIsRunning(false);
    }
  }

  function toggleWorkModel(val: 'remote' | 'hybrid' | 'onsite') {
    setWorkModels((current) =>
      current.includes(val)
        ? current.filter((x) => x !== val)
        : [...current, val],
    );
  }

  function toggleSeniority(
    val: 'internship' | 'entry' | 'junior' | 'mid' | 'senior',
  ) {
    setSeniorityLevels((current) =>
      current.includes(val)
        ? current.filter((x) => x !== val)
        : [...current, val],
    );
  }

  function toggleEmploymentType(val: 'full-time' | 'contract' | 'internship') {
    setEmploymentTypes((current) =>
      current.includes(val)
        ? current.filter((x) => x !== val)
        : [...current, val],
    );
  }

  return (
    <div className="page search-page">
      <PageHeader
        description="Configure search preferences to control what jobs Rolevia discovers and surfaces."
        eyebrow="Discovery Configuration V1"
        title="Search & Discovery"
      />

      {loading && <p>Loading search preferences...</p>}
      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="search-layout">
        <main className="preferences-main">
          <div className="target-selector-bar">
            <h3>Search Preferences</h3>
            <div className="target-pill-list">
              {targets.map((t) => (
                <button
                  key={t.id}
                  className={`button ${selectedTargetId === t.id ? 'button-primary' : 'button-secondary'}`}
                  onClick={() => populateForm(t)}
                  type="button"
                >
                  {t.name} {!t.enabled && '(Disabled)'}
                </button>
              ))}
              <button
                className="button button-outline"
                onClick={handleNewTarget}
                type="button"
              >
                + New Preference
              </button>
            </div>
          </div>

          <form
            className="preferences-form"
            onSubmit={(e) => void handleSave(e)}
          >
            <section aria-labelledby="target-name-heading">
              <div className="form-section-heading">
                <span>01</span>
                <div>
                  <h2 id="target-name-heading">Preference Name & Scope</h2>
                  <p>Name this search and define the jobs it should include.</p>
                </div>
              </div>
              <div className="field-row">
                <label>
                  <span>Preference Name</span>
                  <input
                    onChange={(e) => setName(e.target.value)}
                    required
                    value={name}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    type="checkbox"
                  />
                  <span>Search Enabled</span>
                </label>
              </div>
            </section>

            <section aria-labelledby="roles-locations-heading">
              <div className="form-section-heading">
                <span>02</span>
                <div>
                  <h2 id="roles-locations-heading">Roles & Locations</h2>
                  <p>
                    Target roles and geographic restrictions (Hard Filter vs
                    Preference).
                  </p>
                </div>
              </div>
              <label>
                <span>Target Roles (comma-separated)</span>
                <input
                  onChange={(e) => setTargetRoles(e.target.value)}
                  placeholder="Backend Engineer, Platform Engineer"
                  value={targetRoles}
                />
              </label>
              <label>
                <span>Locations (comma-separated)</span>
                <input
                  onChange={(e) => setLocations(e.target.value)}
                  placeholder="Germany, Remote Europe"
                  value={locations}
                />
              </label>
              <label className="checkbox-label">
                <input
                  checked={locationIsHardFilter}
                  onChange={(e) => setLocationIsHardFilter(e.target.checked)}
                  type="checkbox"
                />
                <span>
                  Treat location as a Hard Discovery Filter (reject non-matching
                  locations)
                </span>
              </label>
            </section>

            <section aria-labelledby="work-model-heading">
              <div className="form-section-heading">
                <span>03</span>
                <div>
                  <h2 id="work-model-heading">Work Model & Seniority</h2>
                  <p>Work arrangements and experience level requirements.</p>
                </div>
              </div>
              <fieldset>
                <legend>Allowed Work Models</legend>
                <div className="choice-grid">
                  {(['remote', 'hybrid', 'onsite'] as const).map((wm) => (
                    <label key={wm}>
                      <input
                        checked={workModels.includes(wm)}
                        onChange={() => toggleWorkModel(wm)}
                        type="checkbox"
                      />
                      <span>{wm}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="checkbox-label">
                <input
                  checked={workModelIsHardFilter}
                  onChange={(e) => setWorkModelIsHardFilter(e.target.checked)}
                  type="checkbox"
                />
                <span>Treat Work Model as Hard Filter</span>
              </label>

              <fieldset>
                <legend>Seniority Levels</legend>
                <div className="choice-grid">
                  {(
                    ['internship', 'entry', 'junior', 'mid', 'senior'] as const
                  ).map((sl) => (
                    <label key={sl}>
                      <input
                        checked={seniorityLevels.includes(sl)}
                        onChange={() => toggleSeniority(sl)}
                        type="checkbox"
                      />
                      <span>{sl}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Employment Types</legend>
                <div className="choice-grid">
                  {(['full-time', 'contract', 'internship'] as const).map(
                    (et) => (
                      <label key={et}>
                        <input
                          checked={employmentTypes.includes(et)}
                          onChange={() => toggleEmploymentType(et)}
                          type="checkbox"
                        />
                        <span>{et}</span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            </section>

            <section aria-labelledby="keywords-exclusions-heading">
              <div className="form-section-heading">
                <span>04</span>
                <div>
                  <h2 id="keywords-exclusions-heading">
                    Required Terms & Exclusions
                  </h2>
                  <p>Deterministic term matching and hard exclusions.</p>
                </div>
              </div>
              <label>
                <span>Required Terms (must be present in title/content)</span>
                <input
                  onChange={(e) => setRequiredTerms(e.target.value)}
                  placeholder="TypeScript, Node.js"
                  value={requiredTerms}
                />
              </label>
              <label>
                <span>Excluded Terms (hard rejection if present)</span>
                <input
                  onChange={(e) => setExcludedTerms(e.target.value)}
                  placeholder="Internship, Freelance"
                  value={excludedTerms}
                />
              </label>
            </section>

            <section aria-labelledby="sources-heading">
              <div className="form-section-heading">
                <span>05</span>
                <div>
                  <h2 id="sources-heading">Job Sources</h2>
                  <p>Choose the hiring sites this search should scan.</p>
                </div>
              </div>
              {sources.map((source, index) => (
                <div
                  className="field-row"
                  key={`${index}-${source.sourceSystem}`}
                >
                  <label>
                    <span>Job source {index + 1}</span>
                    <select
                      aria-label={`Job source ${index + 1}`}
                      value={source.sourceSystem}
                      onChange={(e) =>
                        setSources((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  sourceSystem: e.target.value,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="greenhouse">Greenhouse</option>
                      <option value="lever">Lever</option>
                      <option value="ashby">Ashby</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      {source.sourceSystem === 'greenhouse'
                        ? 'Greenhouse Board Token'
                        : source.sourceSystem === 'lever'
                          ? 'Lever Company/Site Identifier'
                          : 'Ashby Board Identifier'}
                    </span>
                    <input
                      aria-label={`${source.sourceSystem} identifier ${index + 1}`}
                      onChange={(e) =>
                        setSources((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, boardId: e.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Company-provided identifier"
                      required
                      value={source.boardId}
                    />
                  </label>
                  {sources.length > 1 && (
                    <button
                      className="button button-outline"
                      onClick={() =>
                        setSources((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      Remove source {index + 1}
                    </button>
                  )}
                </div>
              ))}
              <button
                className="button button-secondary"
                onClick={() =>
                  setSources((current) => [...current, { ...EMPTY_SOURCE }])
                }
                type="button"
              >
                + Add job source
              </button>
            </section>

            <div className="form-actions">
              <button className="button button-primary" type="submit">
                {selectedTargetId
                  ? 'Save Search Preference'
                  : 'Create Search Preference'}
              </button>

              {selectedTargetId && (
                <button
                  className="button button-secondary"
                  disabled={isRunning}
                  onClick={() => void handleRunDiscovery()}
                  type="button"
                >
                  {isRunning ? 'Searching...' : 'Run Discovery Now'}
                </button>
              )}
            </div>

            {runStatusNotice && (
              <p aria-live="polite" className="session-notice">
                {runStatusNotice}
              </p>
            )}
          </form>
        </main>

        <aside className="source-status-panel">
          <div>
            <p className="eyebrow">Discovery Audit</p>
            <h2>Search Activity History</h2>
            <p>Results from past automated and manual job searches.</p>
          </div>

          <div className="discovery-run-history-list">
            {runs.length === 0 ? (
              <p className="empty-notice">No job searches recorded yet.</p>
            ) : (
              runs.map((r) => (
                <article key={r.id} className="discovery-run-card">
                  <div className="run-card-header">
                    <strong>
                      {r.sourceSystem} ({r.searchTargetId})
                    </strong>
                    <DiscoveryRunStatus status={r.status} />
                  </div>
                  <small>{new Date(r.startedAt).toLocaleString()}</small>
                  <div className="run-counts-grid">
                    <span>Discovered: {r.discoveredCount}</span>
                    <span>Accepted: {r.acceptedCount}</span>
                    <span>Rejected: {r.rejectedCount}</span>
                  </div>
                  {r.errorSummary && (
                    <p className="error-summary">{r.errorSummary}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SearchPage;
