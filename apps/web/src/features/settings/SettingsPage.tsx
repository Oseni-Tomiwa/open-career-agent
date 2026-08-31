import { useState } from 'react';

import { useTheme, type ThemePreference } from '../../app/ThemeProvider.js';
import { Icon } from '../../components/Icon.js';
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
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">
            Manage factual career information, supporting evidence, and display
            preferences.
          </p>
        </div>
      </header>

      <div
        className="tab-bar"
        style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}
      >
        <button
          className={`button ${activeTab === 'profile' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveTab('profile')}
          type="button"
        >
          <Icon name="profile" size={16} /> Career Profile
        </button>
        <button
          className={`button ${activeTab === 'appearance' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setActiveTab('appearance')}
          type="button"
        >
          <Icon name="sun" size={16} /> Appearance
        </button>
      </div>

      {activeTab === 'profile' && <ProfilePage />}

      {activeTab === 'appearance' && (
        <div className="card" style={{ padding: '24px', maxWidth: '600px' }}>
          <h2>Appearance Settings</h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              marginBottom: '20px',
            }}
          >
            Choose your preferred color theme for the Rolevia interface.
          </p>

          <div style={{ display: 'flex', gap: '16px' }}>
            {themeOptions.map((item) => (
              <button
                key={item.value}
                className={`button ${preference === item.value ? 'button-primary' : 'button-secondary'}`}
                onClick={() => setPreference(item.value)}
                style={{
                  flex: 1,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
                type="button"
              >
                <Icon name={item.icon} size={24} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
