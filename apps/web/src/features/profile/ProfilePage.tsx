import { useProductData } from '../../app/ProductDataProvider.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { EvidenceStateLabel } from '../../components/Status.js';

export function ProfilePage() {
  const { snapshot } = useProductData();
  const profile = snapshot.profile;
  const incomplete = profile.evidence.filter(
    (evidence) => evidence.state === 'unreviewed',
  ).length;

  return (
    <div className="page profile-page">
      <PageHeader
        description="Career Memory keeps candidate claims connected to their origin, scope, and verification state."
        eyebrow="Evidence-backed profile"
        title="Career Profile"
      />

      <section className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {profile.initials}
        </span>
        <div>
          <p className="eyebrow">Fictional development candidate</p>
          <h2>{profile.name}</h2>
          <strong>{profile.headline}</strong>
          <p>{profile.summary}</p>
          <span>
            <Icon name="location" size={15} />
            {profile.location}
          </span>
        </div>
        <div className="memory-completeness">
          <span className="metric-label">Evidence completeness</span>
          <strong>{profile.completeness}%</strong>
          <div
            className="score-track"
            role="img"
            aria-label={`Career Memory is ${profile.completeness}% complete`}
          >
            <span style={{ width: `${profile.completeness}%` }} />
          </div>
          <small>{incomplete} item needs verification</small>
        </div>
      </section>

      <div className="profile-layout">
        <div className="profile-primary">
          <section className="profile-section" aria-labelledby="skills-heading">
            <div className="section-heading compact">
              <div>
                <h2 id="skills-heading">Skills and supporting evidence</h2>
                <p>
                  A skill without evidence remains incomplete rather than
                  silently verified.
                </p>
              </div>
            </div>
            <div
              className="skills-table"
              role="table"
              aria-label="Skills and evidence"
            >
              {profile.skills.map((skill) => (
                <div role="row" key={skill.name}>
                  <div role="cell">
                    <strong>{skill.name}</strong>
                    <span data-skill-level={skill.level}>{skill.level}</span>
                  </div>
                  <div role="cell">
                    {skill.evidenceIds.length > 0
                      ? `Verified through ${skill.evidenceIds.length} Evidence item${skill.evidenceIds.length === 1 ? '' : 's'}`
                      : 'No direct Evidence recorded'}
                  </div>
                  <div className="evidence-mini-stack" role="cell">
                    {skill.evidenceIds.slice(0, 3).map((id) => (
                      <span key={id}>
                        {profile.evidence.find((item) => item.id === id)
                          ?.type ?? 'Evidence'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="profile-section"
            aria-labelledby="experience-heading"
          >
            <div className="section-heading compact">
              <div>
                <h2 id="experience-heading">Experience</h2>
                <p>
                  Claims remain scoped to the responsibility actually supported.
                </p>
              </div>
            </div>
            <div className="career-records">
              {profile.experience.map((experience) => (
                <article key={experience.organization}>
                  <span className="record-line" />
                  <div>
                    <span>{experience.period}</span>
                    <h3>{experience.role}</h3>
                    <strong>{experience.organization}</strong>
                    <p>{experience.summary}</p>
                    <small>
                      {experience.evidenceIds.length} linked Evidence item
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section
            className="profile-section"
            aria-labelledby="projects-heading"
          >
            <div className="section-heading compact">
              <div>
                <h2 id="projects-heading">Projects</h2>
                <p>
                  Project evidence can support emerging skills without inventing
                  work history.
                </p>
              </div>
            </div>
            <div className="project-grid">
              {profile.projects.map((project) => (
                <article key={project.name}>
                  <Icon name="briefcase" />
                  <h3>{project.name}</h3>
                  <p>{project.summary}</p>
                  <div>
                    {project.technologies.map((technology) => (
                      <span key={technology}>{technology}</span>
                    ))}
                  </div>
                  <small>
                    {project.evidenceIds.length} source-verified project record
                  </small>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="profile-sidebar">
          <section>
            <h2>Targets</h2>
            <ul>
              {profile.targetRoles.map((role) => (
                <li key={role}>{role}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Preferences and constraints</h2>
            <ul>
              {profile.preferences.map((preference) => (
                <li key={preference}>
                  <Icon name="check" size={15} />
                  {preference}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Education</h2>
            {profile.education.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
          <section>
            <h2>Certifications</h2>
            {profile.certifications.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </section>
        </aside>
      </div>

      <section
        className="profile-section evidence-register"
        aria-labelledby="evidence-register-heading"
      >
        <div className="section-heading compact">
          <div>
            <h2 id="evidence-register-heading">Evidence register</h2>
            <p>
              Provenance and verification stay visible so corrections update the
              underlying memory.
            </p>
          </div>
        </div>
        <div className="evidence-register-grid">
          {profile.evidence.map((evidence) => (
            <article key={evidence.id}>
              <div>
                <span className="evidence-type">{evidence.type}</span>
                <EvidenceStateLabel state={evidence.state} />
              </div>
              <h3>{evidence.label}</h3>
              <p>{evidence.detail}</p>
              <small>{evidence.source}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default ProfilePage;
