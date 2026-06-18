import { X } from 'lucide-react';

// Fullscreen in-app image viewer. Used wherever we show user-attached
// photos that may be stored as `data:` URLs — clicking such a URL via an
// `<a target="_blank">` is BLOCKED by Chrome (lands on about:blank#blocked),
// so opening the image in a new tab never works. This overlay renders the
// image inline instead, which works for both data: and https: URLs.
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/90 z-[10000] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt || ''}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>
  );
}
