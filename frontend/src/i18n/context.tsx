import { createContext, useContext } from 'react';
import { translations, type TranslationKey, type Language } from './translations';

interface I18nContext {
  language: Language;
  t: (key: TranslationKey) => string;
}

const I18nCtx = createContext<I18nContext>({
  language: 'de',
  t: (key) => translations.de[key],
});

export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const t = (key: TranslationKey) => translations[language][key] ?? translations.de[key] ?? key;

  return (
    <I18nCtx.Provider value={{ language, t }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nCtx);
}
