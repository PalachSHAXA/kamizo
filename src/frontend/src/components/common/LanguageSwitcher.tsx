import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useLanguageStore, type Language } from '../../stores/languageStore';

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
  ];

  const current = languages.find(l => l.code === language);

  if (compact) {
    return (
      <button
        onClick={() => setLanguage(language === 'ru' ? 'uz' : 'ru')}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/30 transition-colors text-sm touch-manipulation"
      >
        <span>{current?.flag}</span>
        <span className="font-medium">{language.toUpperCase()}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/30 transition-colors touch-manipulation"
      >
        <Globe className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-medium">{current?.flag} {current?.label}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-w-[140px]" style={{ zIndex: 9999 }}>
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setLanguage(lang.code); setIsOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 touch-manipulation ${
                  language === lang.code ? 'bg-yellow-50 text-yellow-700' : ''
                }`}
              >
                <span>{lang.flag}</span>
                <span className="text-sm">{lang.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
