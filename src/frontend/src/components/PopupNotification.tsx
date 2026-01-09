import { useState, useEffect } from 'react';
import { X, Bell, AlertTriangle, Users, CheckCircle } from 'lucide-react';

export type PopupType =
  | 'announcement_urgent'    // Срочное объявление
  | 'announcement_meeting'   // Собрание жильцов
  | 'request_completed'      // Заявка завершена - оцените
  | 'info';                  // Обычное уведомление

interface PopupNotificationProps {
  type: PopupType;
  title: string;
  message: string;
  onClose: () => void;
  onAction?: () => void;
  actionLabel?: string;
  autoClose?: number; // ms, 0 = don't auto close
}

export function PopupNotification({
  type,
  title,
  message,
  onClose,
  onAction,
  actionLabel,
  autoClose = 0,
}: PopupNotificationProps) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (autoClose > 0) {
      const timer = setTimeout(() => handleClose(), autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  };

  const handleAction = () => {
    if (onAction) {
      onAction();
    }
    handleClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'announcement_urgent':
        return <AlertTriangle className="w-8 h-8 text-red-500" />;
      case 'announcement_meeting':
        return <Users className="w-8 h-8 text-blue-500" />;
      case 'request_completed':
        return <CheckCircle className="w-8 h-8 text-green-500" />;
      default:
        return <Bell className="w-8 h-8 text-yellow-500" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'announcement_urgent':
        return 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200';
      case 'announcement_meeting':
        return 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200';
      case 'request_completed':
        return 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200';
      default:
        return 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200';
    }
  };

  const getActionBtnColor = () => {
    switch (type) {
      case 'announcement_urgent':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'announcement_meeting':
        return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'request_completed':
        return 'bg-green-500 hover:bg-green-600 text-white';
      default:
        return 'bg-orange-400 hover:bg-orange-500 text-black';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`
          relative w-full max-w-sm rounded-2xl border-2 shadow-2xl p-6
          ${getBgColor()}
          ${isClosing ? 'animate-out zoom-out-95 fade-out duration-300' : 'animate-in zoom-in-95 fade-in duration-300'}
        `}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-black/10 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center">
            {getIcon()}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
          {title}
        </h3>

        {/* Message */}
        <p className="text-center text-gray-600 mb-6 leading-relaxed">
          {message}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {onAction && actionLabel && (
            <button
              onClick={handleAction}
              className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors ${getActionBtnColor()}`}
            >
              {actionLabel}
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-full py-3 px-4 rounded-xl font-medium text-gray-600 hover:bg-black/5 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// Manager for multiple popups (queue)
interface PopupItem {
  id: string;
  type: PopupType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface PopupManagerProps {
  popups: PopupItem[];
  onDismiss: (id: string) => void;
}

export function PopupManager({ popups, onDismiss }: PopupManagerProps) {
  const currentPopup = popups[0]; // Show one at a time

  if (!currentPopup) return null;

  return (
    <PopupNotification
      type={currentPopup.type}
      title={currentPopup.title}
      message={currentPopup.message}
      actionLabel={currentPopup.actionLabel}
      onAction={currentPopup.onAction}
      onClose={() => onDismiss(currentPopup.id)}
    />
  );
}
