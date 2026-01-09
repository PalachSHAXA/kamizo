import { useState, useEffect } from 'react';
import { StickyNote, Plus, Save, Trash2, X, Edit3 } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface NotepadProps {
  userId: string;
}

export function Notepad({ userId }: NotepadProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  // Load notes from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem(`notes_${userId}`);
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch (e) {
        console.error('Failed to parse notes:', e);
      }
    }
  }, [userId]);

  // Save notes to localStorage
  const saveNotes = (updatedNotes: Note[]) => {
    setNotes(updatedNotes);
    localStorage.setItem(`notes_${userId}`, JSON.stringify(updatedNotes));
  };

  const addNote = () => {
    if (!newNoteTitle.trim()) return;
    const newNote: Note = {
      id: Date.now().toString(),
      title: newNoteTitle,
      content: newNoteContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveNotes([newNote, ...notes]);
    setNewNoteTitle('');
    setNewNoteContent('');
    setShowNoteEditor(false);
  };

  const updateNote = () => {
    if (!editingNote) return;
    const updatedNotes = notes.map(n =>
      n.id === editingNote.id
        ? { ...editingNote, updatedAt: new Date().toISOString() }
        : n
    );
    saveNotes(updatedNotes);
    setEditingNote(null);
  };

  const deleteNote = (id: string) => {
    if (confirm('Удалить эту заметку?')) {
      saveNotes(notes.filter(n => n.id !== id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold">Мои заметки</h3>
          <span className="text-sm text-gray-500">({notes.length})</span>
        </div>
        <button
          onClick={() => setShowNoteEditor(true)}
          className="btn-primary flex items-center gap-2 py-2 px-3 text-sm"
        >
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {/* Notes Grid */}
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
                  title="Редактировать"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap line-clamp-4">
              {note.content || <span className="italic text-gray-400">Нет содержимого</span>}
            </p>
            <div className="text-xs text-gray-400 mt-3 pt-2 border-t border-gray-100">
              {new Date(note.updatedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {notes.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <StickyNote className="w-8 h-8 text-amber-500" />
          </div>
          <h4 className="font-semibold text-gray-900 mb-1">Нет заметок</h4>
          <p className="text-gray-500 text-sm mb-4">
            Создавайте заметки для планирования задач и важных записей
          </p>
          <button
            onClick={() => setShowNoteEditor(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Создать первую заметку
          </button>
        </div>
      )}

      {/* Add/Edit Note Modal */}
      {(showNoteEditor || editingNote) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold">
                {editingNote ? 'Редактировать заметку' : 'Новая заметка'}
              </h2>
              <button
                onClick={() => {
                  setShowNoteEditor(false);
                  setEditingNote(null);
                  setNewNoteTitle('');
                  setNewNoteContent('');
                }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Заголовок <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingNote ? editingNote.title : newNoteTitle}
                  onChange={(e) => editingNote
                    ? setEditingNote({ ...editingNote, title: e.target.value })
                    : setNewNoteTitle(e.target.value)
                  }
                  placeholder="Название заметки..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Содержание
                </label>
                <textarea
                  value={editingNote ? editingNote.content : newNoteContent}
                  onChange={(e) => editingNote
                    ? setEditingNote({ ...editingNote, content: e.target.value })
                    : setNewNoteContent(e.target.value)
                  }
                  placeholder="Ваши заметки, задачи, планы..."
                  rows={8}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => {
                  setShowNoteEditor(false);
                  setEditingNote(null);
                  setNewNoteTitle('');
                  setNewNoteContent('');
                }}
                className="flex-1 py-2.5 px-4 bg-white border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => editingNote ? updateNote() : addNote()}
                disabled={editingNote ? !editingNote.title.trim() : !newNoteTitle.trim()}
                className="flex-1 py-2.5 px-4 bg-orange-400 hover:bg-orange-500 rounded-xl font-medium text-gray-900 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
