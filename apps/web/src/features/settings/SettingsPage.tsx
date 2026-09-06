import { useState } from 'react';

import { useTheme, type ThemePreference } from '../../app/ThemeProvider.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { WorkspaceSectionHeader } from '../../components/WorkspaceSection.js';
import ProfilePage from '../profile/ProfilePage.js';

type SettingsTab = 'profile' | 'appearance';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const { preference, setPreference } = useTheme();

  const themeOptions: readonly {
    readonly value: ThemePreference;
    readonly label: string;
    readonly icon: 'sun' | 'moon' | 'system';
  }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System Default', icon: 'system' },
  ];

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Candidate workspace"
        title="Settings"
        description="Manage the career evidence Rolevia evaluates separately from ordinary workspace preferences."
        variant="operational"
      />

      <div aria-label="Settings sections" className="workspace-tabs">
        <button
          aria-pressed={activeTab === 'profile'}
          className={`button ${activeTab === 'profile' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveTab('profile')}
          type="button"
        >
          <Icon name="profile" size={16} /> Career Profile
        </button>
        <button
          aria-pressed={activeTab === 'appearance'}
          className={`button ${activeTab === 'appearance' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveTab('appearance')}
          type="button"
        >
          <Icon name="sun" size={16} /> Appearance
        </button>
      </div>

      {activeTab === 'profile' && <ProfilePage />}

      {activeTab === 'appearance' && (
        <section
          className="appearance-settings"
          aria-labelledby="appearance-heading"
        >
          <WorkspaceSectionHeader
            id="appearance-heading"
            meta="Workspace preference"
            title="Appearance Settings"
            description="Choose how this browser displays Rolevia. System Default follows your operating-system preference."
          />
          <div className="appearance-options">
            {themeOptions.map((item) => (
              <button
                key={item.value}
                className={`button ${preference === item.value ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreference(item.value)}
                type="button"
              >
                <Icon name={item.icon} size={24} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
