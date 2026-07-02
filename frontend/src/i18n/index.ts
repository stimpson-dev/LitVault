import { useContext } from 'react';
import { I18nCtx } from './context';

export { translations, type TranslationKey, type Language } from './translations';
export { LanguageProvider } from './context';

export function useTranslation() {
  return useContext(I18nCtx);
}
