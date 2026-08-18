import { Eye } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';

type DemoReadOnlyBannerProps = {
  scope?: 'default' | 'finance' | 'settings';
};

export function DemoReadOnlyBanner({ scope = 'default' }: DemoReadOnlyBannerProps) {
  const language = useLanguageStore((state) => state.language);
  const text = scope === 'finance'
    ? (language === 'ru'
      ? 'Демо-режим: финансовые данные доступны только для просмотра'
      : 'Demo rejim: moliyaviy ma\'lumotlar faqat ko\'rish uchun mavjud')
    : scope === 'settings'
      ? (language === 'ru'
        ? 'Демо-режим: чувствительные настройки доступны только для просмотра'
        : 'Demo rejim: maxfiy sozlamalar faqat ko\'rish uchun mavjud')
      : (language === 'ru'
        ? 'Демо-режим: изменения недоступны'
        : "Demo rejim: o'zgarishlar mavjud emas");

  return (
    <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-800" role="status">
      <Eye className="h-4 w-4 shrink-0" />
      {text}
    </div>
  );
}
