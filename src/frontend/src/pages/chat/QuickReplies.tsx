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

  return (
    <div className="px-4 py-2.5 border-b bg-orange-50/50 flex gap-2 overflow-x-auto scrollbar-none">
      {replies.map((reply, i) => (
        <button
          key={i}
          onClick={() => onSelect(reply)}
          className="flex-shrink-0 px-3.5 py-2 bg-white border border-orange-200 rounded-[12px] text-xs font-medium text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-all active:scale-95 shadow-sm"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
