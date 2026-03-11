import { useState, useEffect, useCallback } from 'react';
import { getAppSettings, updateAppSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/types';

const DEFAULTS: AppSettings = {
  language: 'de',
  theme: 'dark',
  start_page: 'search',
  results_per_page: 25,
  default_sort: 'date_desc',
  view_mode: 'list',
  show_favorites_sidebar: true,
  watch_folders: [],
  poll_interval_seconds: 30,
  db_path: '',
  thumbnails_dir: '',
  log_level: '',
};

export function useSettings() {
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

  return { settings, loaded, update, refresh };
}
