import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'text-green-400 border-green-400/30',
  error: 'text-red-400 border-red-400/30',
  warning: 'text-yellow-400 border-yellow-400/30',
  info: 'text-blue-400 border-blue-400/30',
};

function ToastItem({ id, type, message }: { id: string; type: keyof typeof icons; message: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => removeToast(id), 200);
  };

  const Icon = icons[type] || Info;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl bg-white/10 shadow-lg transition-all duration-200 ${colors[type]} ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <span className="text-sm text-white flex-1">{message}</span>
      <button onClick={handleClose} className="text-white/50 hover:text-white shrink-0" aria-label="Закрыть">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[150] flex flex-col gap-2 max-w-sm w-full pointer-events-auto">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
