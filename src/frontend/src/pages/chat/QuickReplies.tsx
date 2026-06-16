// Sprint 14: moved out of ChatPage. Renders a horizontal row of canned
// support-team responses above the composer when a manager is in a
// private_support thread. Tap a reply → it's placed in the composer
// for the manager to edit-and-send (not auto-sent).
//
// Phase 2 / commit 3 — added TemplatesPicker. A trailing "+" button
// opens a popover with 7 hardcoded templates per the task brief. Tap
// a template → same behaviour as the inline replies (placed in the
// composer for edit-then-send). Per-tenant template management is a
// future feature (chat-spec.md §4.4) — templates here are static in
// code, not loaded from the API.

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

const TEMPLATES_RU = [
  'Принято в работу',
  'Готово',
  'Передано исполнителю',
  'Уточните адрес, пожалуйста',
  'Скоро будем',
  'Спасибо за обращение',
  'Извините за задержку',
];

const TEMPLATES_UZ = [
  'Ishga qabul qilindi',
  'Tayyor',
  'Bajaruvchiga topshirildi',
  'Manzilni aniqlang',
  "Tez orada yetib boramiz",
  "Murojaat uchun rahmat",
  "Kechikkanimiz uchun uzr",
];

export function QuickReplies({
  onSelect,
  language,
}: {
  onSelect: (text: string) => void;
  language: string;
}) {
  const isRu = language === 'ru';

  const replies = isRu
    ? [
        'Ваша заявка принята ✅',
        'Мастер уже выехал 🚗',
        'Проблема решена! 🎉',
        'Уточните, пожалуйста 🤔',
        'Спасибо за обращение!',
      ]
    : [
        'Arizangiz qabul qilindi ✅',
        "Usta yo'lga chiqdi 🚗",
        'Muammo hal qilindi! 🎉',
        'Iltimos, aniqlang 🤔',
        'Murojaat uchun rahmat!',
      ];

  const templates = isRu ? TEMPLATES_RU : TEMPLATES_UZ;

  const [showTemplates, setShowTemplates] = useState(false);

  const pickTemplate = (t: string) => {
    onSelect(t);
    setShowTemplates(false);
  };

  // Strip styling matches the v2 admin chat design (kamizo-admin-dialog.jsx
  // quick-replies row at L230-235): tokens-themed pills on a transparent
  // strip so the strip blends with whatever surface sits behind it (light
  // app-bg in light, warm-dark in dark via the existing safety-net for
  // bg-white / border-gray-200 utility classes). The 5 hardcoded inline
  // replies stay the same copy. The new trailing "+" opens the templates
  // popover with 7 longer templates (per task brief commit 3).
  return (
    <div className="relative">
      <div className="px-3 pt-2 pb-1.5 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-gray-100">
        {replies.map((reply, i) => (
          <button
            key={i}
            onClick={() => onSelect(reply)}
            className="flex-shrink-0 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 shadow-sm whitespace-nowrap"
          >
            {reply}
          </button>
        ))}
        {/* Templates picker trigger — opens the popover with the 7 long
            templates (chat-spec.md §4.4 hardcoded templates list). */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-orange-50 border border-orange-200 rounded-full text-orange-600 hover:bg-orange-100 hover:border-orange-300 transition-all active:scale-95 shadow-sm touch-manipulation"
          aria-label={isRu ? 'Шаблоны ответов' : 'Javob shablonlari'}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* TemplatesPicker popover.
          v114: switched bottom-full → top-full because QuickReplies was
          rendered at the TOP of the chat.
          v116: ChatView moved QuickReplies to the BOTTOM (above
          Composer), so top-full would now open BELOW the strip — off
          the bottom of the viewport. Reverted to bottom-full so the
          popover opens UPWARD into the message list area (visible).
          Tapping the backdrop closes; tapping a template inserts text
          into the composer without auto-send. */}
      {showTemplates && (
        <div
          onClick={() => setShowTemplates(false)}
          className="absolute inset-x-0 bottom-full z-40"
          role="presentation"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-3 bottom-2 w-[min(20rem,90vw)] bg-white rounded-[16px] shadow-xl border border-gray-100 overflow-hidden"
            role="dialog"
            aria-label={isRu ? 'Шаблоны ответов' : 'Javob shablonlari'}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
              <Plus className="w-4 h-4 text-orange-500" />
              <div className="flex-1 text-[13.5px] font-bold text-gray-900">
                {isRu ? 'Шаблоны ответов' : 'Javob shablonlari'}
              </div>
              <button
                onClick={() => setShowTemplates(false)}
                className="w-7 h-7 grid place-items-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors touch-manipulation"
                aria-label={isRu ? 'Закрыть' : 'Yopish'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => pickTemplate(t)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-[13.5px] font-semibold text-gray-800 border-b border-gray-50 last:border-b-0 touch-manipulation"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
