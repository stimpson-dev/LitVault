import { useState, useCallback } from 'react';

export interface RecentDoc {
  id: number;
  title: string;
}

const STORAGE_KEY = 'litvault-recent-docs';
const MAX_RECENT = 10;

function loadRecent(): RecentDoc[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(docs: RecentDoc[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export function useRecentDocs() {
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>(loadRecent);

  const addRecent = useCallback((id: number, title: string) => {
    setRecentDocs((prev) => {
      const filtered = prev.filter((d) => d.id !== id);
      const next = [{ id, title }, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((id: number) => {
    setRecentDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveRecent(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setRecentDocs([]);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recentDocs, addRecent, removeRecent, clearAll };
}
