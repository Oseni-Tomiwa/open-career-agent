import { useState } from 'react';

import { useProductData } from '../../app/ProductDataProvider.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import type { SearchPreferences } from '../../data/types.js';

export function SearchPage() {
  const { snapshot, saveSearchPreferences } = useProductData();
  const [form, setForm] = useState<SearchPreferences>(
    snapshot.searchPreferences,
  );
  const [notice, setNotice] = useState<string | null>(null);

  function setArray(key: 'targetRoles' | 'locations', value: string) {
    setForm((current) => ({
      ...current,
      [key]: value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  }

  function toggleArray(
    key: 'remotePreferences' | 'employmentTypes' | 'sources',
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSearchPreferences(form);
    setNotice(
      'Search preferences saved for this development session. No live source scan was started.',
    );
  }

  return (
    <div className="page search-page">
      <PageHeader
        description="Configure what discovery should look for. Current source status is seeded and does not represent live ATS activity."
        eyebrow="Discovery configuration"
        title="Search"
      />

      <div className="search-layout">
        <form
          className="preferences-form"
          onSubmit={(e) => {
            void save(e);
          }}
        >
          <section aria-labelledby="role-preferences-heading">
            <div className="form-section-heading">
              <span>01</span>
              <div>
                <h2 id="role-preferences-heading">Role and location</h2>
                <p>
                  Comma-separated values remain explicit and easy to review.
                </p>
              </div>
            </div>
            <label>
              <span>Target roles</span>
              <input
                onChange={(event) =>
                  setArray('targetRoles', event.target.value)
                }
                value={form.targetRoles.join(', ')}
              />
            </label>
            <label>
              <span>Locations</span>
              <input
                onChange={(event) => setArray('locations', event.target.value)}
                value={form.locations.join(', ')}
              />
            </label>
            <fieldset>
              <legend>Work model</legend>
              <div className="choice-grid">
                {['Remote', 'Hybrid', 'On-site'].map((item) => (
                  <label key={item}>
                    <input
                      checked={form.remotePreferences.includes(item)}
                      onChange={() => toggleArray('remotePreferences', item)}
                      type="checkbox"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="compensation-heading">
            <div className="form-section-heading">
              <span>02</span>
              <div>
                <h2 id="compensation-heading">Compensation and engagement</h2>
                <p>Used as preference context, not an Eligibility gate.</p>
              </div>
            </div>
            <div className="field-row">
              <label>
                <span>Minimum annual compensation</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      salaryMinimum: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={form.salaryMinimum}
                />
              </label>
              <label>
                <span>Currency</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      currency: event.target.value,
                    }))
                  }
                  value={form.currency}
                >
                  <option>USD</option>
                  <option>GBP</option>
                  <option>EUR</option>
                  <option>NGN</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Employment types</legend>
              <div className="choice-grid">
                {['Full-time', 'Contract', 'Internship'].map((item) => (
                  <label key={item}>
                    <input
                      checked={form.employmentTypes.includes(item)}
                      onChange={() => toggleArray('employmentTypes', item)}
                      type="checkbox"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section aria-labelledby="eligibility-preferences-heading">
            <div className="form-section-heading">
              <span>03</span>
              <div>
                <h2 id="eligibility-preferences-heading">
                  Eligibility context
                </h2>
                <p>
                  These candidate facts help discovery preserve blockers and
                  unknowns accurately.
                </p>
              </div>
            </div>
            <div className="switch-list">
              <label>
                <span>
                  <strong>
                    I require employer sponsorship outside my current
                    authorization
                  </strong>
                  <small>
                    Missing sponsorship language will remain unknown.
                  </small>
                </span>
                <input
                  checked={form.requiresSponsorship}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requiresSponsorship: event.target.checked,
                    }))
                  }
                  role="switch"
                  type="checkbox"
                />
              </label>
              <label>
                <span>
                  <strong>I am willing to relocate</strong>
                  <small>
                    Only explicit relocation support is treated as positive
                    evidence.
                  </small>
                </span>
                <input
                  checked={form.willingToRelocate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      willingToRelocate: event.target.checked,
                    }))
                  }
                  role="switch"
                  type="checkbox"
                />
              </label>
            </div>
          </section>

          <section aria-labelledby="sources-heading">
            <div className="form-section-heading">
              <span>04</span>
              <div>
                <h2 id="sources-heading">Sources and freshness</h2>
                <p>
                  Fixture controls only. Live discovery remains future backend
                  work.
                </p>
              </div>
            </div>
            <fieldset>
              <legend>Sources</legend>
              <div className="choice-grid">
                {['Greenhouse', 'Ashby', 'Lever'].map((item) => (
                  <label key={item}>
                    <input
                      checked={form.sources.includes(item)}
                      onChange={() => toggleArray('sources', item)}
                      type="checkbox"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>Maximum listing age: {form.freshnessDays} days</span>
              <input
                aria-label="Maximum listing age in days"
                max="90"
                min="1"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    freshnessDays: Number(event.target.value),
                  }))
                }
                type="range"
                value={form.freshnessDays}
              />
            </label>
          </section>

          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Save development preferences
            </button>
            <span>No live scan will run.</span>
          </div>
          {notice && (
            <p aria-live="polite" className="session-notice">
              {notice}
            </p>
          )}
        </form>

        <aside className="source-status-panel">
          <div>
            <p className="eyebrow">Development mode</p>
            <h2>Seeded source status</h2>
            <p>
              These states exercise scan and recovery presentation. They are not
              network activity.
            </p>
          </div>
          <div className="source-status-list">
            {snapshot.sourceStatuses.map((source) => (
              <article key={source.name}>
                <span className="source-letter" aria-hidden="true">
                  {source.name.slice(0, 1)}
                </span>
                <div>
                  <h3>{source.name}</h3>
                  <span className="source-state" data-state={source.state}>
                    {source.state}
                  </span>
                  <p>{source.detail}</p>
                  <small>{source.lastSeededScan}</small>
                </div>
              </article>
            ))}
          </div>
          <div className="demo-boundary">
            <Icon name="info" />
            <p>
              <strong>Frontend repository boundary</strong>Future API-backed
              discovery can replace the seeded repository without rewriting
              these screens.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SearchPage;
