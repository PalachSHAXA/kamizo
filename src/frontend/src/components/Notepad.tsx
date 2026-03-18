import { useState, useEffect, useCallback } from 'react';
import { StickyNote, Plus, Save, Trash2, X, Edit3, RefreshCw, Loader2 } from 'lucide-react';
import { apiRequest } from '../services/api';
import { useLanguageStore } from '../stores/languageStore';
import { EmptyState } from './common';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface NotepadProps {
  userId: string;
}

export function Notepad({ userId }: NotepadProps) {
  const { language } = useLanguageStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Migrate notes from localStorage to API (one-time)
  const migrateLocalNotes = useCallback(async () => {
    const localStorageKey = `notes_${userId}`;
    const migratedKey = `notes_migrated_${userId}`;

    // Skip if already migrated
    if (localStorage.getItem(migratedKey)) return;

    const raw = localStorage.getItem(localStorageKey);
    if (!raw) {
      localStorage.setItem(migratedKey, 'true');
      return;
    }

    try {
      const localNotes = JSON.parse(raw);
      if (!Array.isArray(localNotes) || localNotes.length === 0) {
        localStorage.setItem(migratedKey, 'true');
        return;
      }

      setMigrating(true);
      for (const note of localNotes) {
        await apiRequest('/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title: note.title, content: note.content }),
        });
      }
      localStorage.setItem(migratedKey, 'true');
      localStorage.removeItem(localStorageKey);
    } catch (e) {
      console.error('Failed to migrate notes:', e);
    } finally {
      setMigrating(false);
    }
  }, [userId]);

  // Fetch notes from API
  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ notes: Note[] }>('/api/notes');
      setNotes(data.notes || []);
    } catch (e) {
      console.error('Failed to fetch notes:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Init: migrate then fetch
  useEffect(() => {
    (async () => {
      await migrateLocalNotes();
      await fetchNotes();
    })();
  }, [migrateLocalNotes, fetchNotes]);

  // Add note
  const addNote = async (title: string, content: string) => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const data = await apiRequest<{ note: Note }>('/api/notes', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), content }),
      });
      setNotes((prev) => [data.note, ...prev]);
      setShowNoteEditor(false);
    } catch (e) {
      console.error('Failed to add note:', e);
    } finally {
      setSaving(false);
    }
  };

  // Update note
  const updateNote = async (note: Note) => {
    if (!note.title.trim()) return;
    setSaving(true);
    try {
      const data = await apiRequest<{ note: Note }>(`/api/notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: note.title.trim(), content: note.content }),
      });
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, ...data.note } : n)));
      setEditingNote(null);
    } catch (e) {
      console.error('Failed to update note:', e);
    } finally {
      setSaving(false);
    }
  };

  // Delete note
  const deleteNote = async (id: string) => {
    if (!confirm(language === 'ru' ? 'Удалить эту заметку?' : 'Bu yozuvni o\'chirishmi?')) return;
    try {
      await apiRequest(`/api/notes/${id}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold">{language === 'ru' ? 'Мои заметки' : 'Mening yozuvlarim'}</h3>
          <span className="text-sm text-gray-500">({notes.length})</span>
          <button
            onClick={fetchNotes}
            disabled={loading}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
            title={language === 'ru' ? 'Обновить' : 'Yangilash'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <button
          onClick={() => setShowNoteEditor(true)}
          className="btn-primary flex items-center gap-2 py-2 px-3 text-sm"
        >
          <Plus className="w-4 h-4" />
          {language === 'ru' ? 'Добавить' : 'Qo\'shish'}
        </button>
      </div>

      {/* Migration indicator */}
      {migrating && (
        <div className="glass-card p-4 text-center text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          {language === 'ru' ? 'Миграция заметок из локального хранилища...' : 'Yozuvlar ko\'chirilmoqda...'}
        </div>
      )}

      {/* Loading */}
      {loading && !migrating && (
        <div className="glass-card p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        </div>
      )}

      {/* Notes Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className="glass-card p-4 hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-gray-900 line-clamp-1">{note.title}</h4>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingNote(note)}
                    className="p-1.5 hover:bg-white/50 rounded-lg text-gray-500 hover:text-blue-600"
                    title={language === 'ru' ? 'Редактировать' : 'Tahrirlash'}
                    aria-label={language === 'ru' ? `Редактировать заметку "${note.title}"` : `"${note.title}" yozuvni tahrirlash`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                    title={language === 'ru' ? 'Удалить' : 'O\'chirish'}
                    aria-label={language === 'ru' ? `Удалить заметку "${note.title}"` : `"${note.title}" yozuvni o'chirish`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-4">
                {note.content || <span className="italic text-gray-400">{language === 'ru' ? 'Нет содержимого' : 'Mazmun yo\'q'}</span>}
              </p>
              <div className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-100">
                {new Date(note.updated_at).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && notes.length === 0 && (
        <EmptyState
          icon={<StickyNote className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет заметок' : 'Yozuvlar yo\'q'}
          description={language === 'ru' ? 'Создавайте заметки для планирования задач и важных записей' : 'Vazifalarni rejalashtirish va muhim yozuvlar uchun yozuvlar yarating'}
          action={{
            label: language === 'ru' ? 'Создать первую заметку' : 'Birinchi yozuvni yaratish',
            onClick: () => setShowNoteEditor(true),
          }}
        />
      )}

      {/* Add/Edit Note Modal */}
      {(showNoteEditor || editingNote) && (
        <NoteModal
          note={editingNote}
          saving={saving}
          onSave={(title, content) =>
            editingNote
              ? updateNote({ ...editingNote, title, content })
              : addNote(title, content)
          }
          onClose={() => {
            setShowNoteEditor(false);
            setEditingNote(null);
          }}
        />
      )}
    </div>
  );
}

function NoteModal({
  note,
  saving,
  onSave,
  onClose,
}: {
  note: Note | null;
  saving: boolean;
  onSave: (title: string, content: string) => void;
  onClose: () => void;
}) {
  const { language } = useLanguageStore();
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">
            {note ? (language === 'ru' ? 'Редактировать заметку' : 'Yozuvni tahrirlash') : (language === 'ru' ? 'Новая заметка' : 'Yangi yozuv')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            aria-label={language === 'ru' ? 'Закрыть' : 'Yopish'}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {language === 'ru' ? 'Заголовок' : 'Sarlavha'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'ru' ? 'Название заметки...' : 'Yozuv nomi...'}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all"
              autoFocus
              aria-label={language === 'ru' ? 'Заголовок заметки' : 'Yozuv sarlavhasi'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {language === 'ru' ? 'Содержание' : 'Mazmun'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={language === 'ru' ? 'Ваши заметки, задачи, планы...' : 'Yozuvlaringiz, vazifalaringiz, rejalaringiz...'}
              rows={8}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all resize-none"
              aria-label={language === 'ru' ? 'Содержание заметки' : 'Yozuv mazmuni'}
            />
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
          </button>
          <button
            onClick={() => onSave(title, content)}
            disabled={!title.trim() || saving}
            className="flex-1 py-2.5 px-4 bg-primary-400 hover:bg-primary-500 rounded-xl font-medium text-gray-900 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {language === 'ru' ? 'Сохранить' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}
