import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message) => {
    // Dedupe: если такой же toast (same type+message) уже в очереди — не
    // плодить дубль. Иначе спам-клики (напр. 5 нажатий Submit пока модалка
    // перекрывает тост на z-index) накапливают стопку одинаковых ошибок.
    const existing = (useToastStore.getState().toasts || []).find(
      (t) => t.type === type && t.message === message,
    );
    if (existing) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
