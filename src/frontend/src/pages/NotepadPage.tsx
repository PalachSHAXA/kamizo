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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{language === 'ru' ? 'Заметки' : 'Eslatmalar'}</h1>
        <p className="text-gray-500 text-sm mt-1">{language === 'ru' ? 'Ваши личные заметки и напоминания' : 'Shaxsiy eslatmalar va eslatmalaringiz'}</p>
      </div>
      <Notepad userId={user.id} />
    </div>
  );
}
