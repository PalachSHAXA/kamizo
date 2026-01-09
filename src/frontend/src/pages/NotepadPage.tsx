import { useAuthStore } from '../stores/authStore';
import { Notepad } from '../components/Notepad';
import { StickyNote } from 'lucide-react';

export function NotepadPage() {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <div className="glass-card p-8 text-center">
        <StickyNote className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">Требуется авторизация</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Заметки</h1>
        <p className="text-gray-500 text-sm mt-1">Ваши личные заметки и напоминания</p>
      </div>
      <Notepad userId={user.id} />
    </div>
  );
}
