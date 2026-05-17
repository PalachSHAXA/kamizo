import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { Notepad } from '../components/Notepad';
import { StickyNote } from 'lucide-react';

export function NotepadPage() {
  const { user } = useAuthStore();
  const { language } = useLanguageStore();

  if (!user) {
    return (
      <div className="glass-card p-8 text-center">
        <StickyNote className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">{language === 'ru' ? 'Требуется авторизация' : 'Avtorizatsiya talab qilinadi'}</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#E8621A] to-[#F59E0B] flex items-center justify-center shadow-sm shrink-0">
          <StickyNote className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{language === 'ru' ? 'Заметки' : 'Eslatmalar'}</h1>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{language === 'ru' ? 'Ваши личные заметки и напоминания' : 'Shaxsiy eslatmalar va eslatmalaringiz'}</p>
        </div>
      </div>
      <Notepad userId={user.id} />
    </div>
  );
}
