import { RouterProvider } from 'react-router-dom';
import { useSettings } from './hooks/useSettings';
import { LanguageProvider } from './i18n';
import { router } from './lib/router';

function App() {
  const { settings } = useSettings();

  return (
    <LanguageProvider language={settings.language}>
      <RouterProvider router={router} />
    </LanguageProvider>
  );
}

export default App;
