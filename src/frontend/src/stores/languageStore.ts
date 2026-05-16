// Sprint 24: dictionaries lifted into stores/i18n/{ru,uz}.ts. This
// file is now just the Zustand store shell + the `t(key)` lookup.
// Same external API as before — every `useLanguageStore()` call site
// works unchanged.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ru } from './i18n/ru';
import { uz } from './i18n/uz';

export type Language = 'ru' | 'uz';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = { ru, uz };

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'ru',
      setLanguage: (lang) => set({ language: lang }),
      t: (key) => {
        const { language } = get();
        return translations[language][key] || key;
      },
    }),
    {
      name: 'language-storage',
    },
  ),
);
