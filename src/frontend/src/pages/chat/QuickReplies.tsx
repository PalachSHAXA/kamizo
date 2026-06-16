// Sprint 14: moved out of ChatPage. Renders a horizontal row of canned
// support-team responses above the composer when a manager is in a
// private_support thread. Tap a reply → it's placed in the composer
// for the manager to edit-and-send (not auto-sent).

export function QuickReplies({
  onSelect,
  language,
}: {
  onSelect: (text: string) => void;
  language: string;
}) {
  const replies =
    language === 'ru'
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

  // Strip styling matches the v2 admin chat design (kamizo-admin-dialog.jsx
  // quick-replies row at L230-235): tokens-themed pills on a transparent
  // strip so the strip blends with whatever surface sits behind it (light
  // app-bg in light, warm-dark in dark via the existing safety-net for
  // bg-white / border-gray-200 utility classes). Sparkle leading-button
  // (templates editor trigger) is deferred to Phase 3 — the editable
  // templates surface needs per-tenant config + a modal which isn't part
  // of Phase 2 scope. The 5 hardcoded replies stay the same copy.
  return (
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
    </div>
  );
}
