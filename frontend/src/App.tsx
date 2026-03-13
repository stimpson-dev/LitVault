import { RouterProvider } from 'react-router-dom';
import { useSettings, SettingsProvider } from './hooks/useSettings';
import { LanguageProvider } from './i18n';
import { router } from './lib/router';

function AppInner() {
  const { settings } = useSettings();

  return (
    <LanguageProvider language={settings.language}>
      <RouterProvider router={router} />
    </LanguageProvider>
  );
}

function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}

export default App;
