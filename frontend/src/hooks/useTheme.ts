import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('litvault-theme') as Theme | null;
    return stored ?? 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('litvault-theme', theme);
  }, [theme]);

  // Apply on first render synchronously to avoid flash
  useEffect(() => {
    applyTheme(theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return { theme, toggle };
}
