import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

// v118.164 — Kamizo-native palette. Previous toast used glassmorphism
// (backdrop-blur-xl + bg-white/10 + text-white) which read as an iOS
// liquid-glass overlay on the warm off-white pages: illegible contrast,
// wrong aesthetic. Each type now maps to a semantic status token from
// index.css and the shell uses the same tokens as RequestDetailsModal /
// HomeHero / MeetingWidget: solid --surface, 1px --border-c, 5px colored
// left stripe carrying the type, --text-primary for the message, icon
// coloured to match the stripe, X close in --text-secondary at 60%.
const accents: Record<keyof typeof icons, string> = {
  success: 'var(--status-active, #16A34A)',
  error:   'var(--status-critical, #DC2626)',
  warning: 'var(--status-pending, #D97706)',
  info:    'var(--status-info, #2F77C2)',
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
  const accent = accents[type] || accents.info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--surface, #FFFFFF)',
        border: '1px solid var(--border-c, #E6DFD2)',
        borderLeft: `5px solid ${accent}`,
        boxShadow: 'var(--shadow-md, 0 4px 16px rgba(28,25,23,0.08))',
        transform: visible ? 'translateX(0)' : 'translateX(32px)',
        opacity: visible ? 1 : 0,
        transition:
          'transform 200ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms cubic-bezier(0.2, 0, 0, 1)',
      }}
    >
      <Icon size={18} style={{ marginTop: 2, color: accent, flexShrink: 0 }} />
      <span
        style={{
          fontSize: 14,
          lineHeight: 1.4,
          color: 'var(--text-primary, #1C1917)',
          flex: 1,
          wordBreak: 'break-word',
        }}
      >
        {message}
      </span>
      <button
        onClick={handleClose}
        aria-label="Закрыть"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--text-secondary, #6F6A62)',
          opacity: 0.6,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed right-4 z-[150] flex flex-col gap-2 max-w-sm w-full pointer-events-auto md:bottom-4"
      style={{ bottom: 'calc(var(--bottom-bar-h, 64px) + 12px)' }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
