import { useState, useEffect, useCallback, useContext, createContext, createElement } from 'react';
import type { ReactNode } from 'react';
import { getAppSettings, updateAppSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/types';

const DEFAULTS: AppSettings = {
  language: 'de',
  theme: 'dark',
  start_page: 'search',
  results_per_page: 25,
  default_sort: 'date_desc',
  view_mode: 'table',
  show_favorites_sidebar: true,
  watch_folders: [],
  poll_interval_seconds: 30,
  db_path: '',
  thumbnails_dir: '',
  log_level: '',
};

interface SettingsContextValue {
  settings: AppSettings;
  loaded: boolean;
  update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then((s) => {
        setSettings(s);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    const updated = await updateAppSettings(patch);
    setSettings(updated);
    return updated;
  }, []);

  const refresh = useCallback(() => {
    getAppSettings().then(setSettings).catch(() => {});
  }, []);

  return createElement(SettingsContext.Provider, { value: { settings, loaded, update, refresh } }, children);
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
