import { useState } from 'react';
import { FileText, Image as ImageIcon, FileIcon, X, Download } from 'lucide-react';

interface MessageContentProps {
  content: string;
  isOwn: boolean;
  language: 'ru' | 'uz';
}

// Fullscreen image lightbox
function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = alt || 'image';
    a.click();
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        className="absolute top-4 right-16 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
      >
        <Download className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>
  );
}

const ATTACHMENT_RE = /\[([^\[\]]+?\.(?:png|jpg|jpeg|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|mp3|mp4|mov))\]/gi;
// Markdown-ish `![alt](data:image/png;base64,...)` inline image embed, used
// when a resident attaches a small image from the chat composer. We accept
// either a data: URL or an https:// URL so external image attachments render
// too when/if object storage is wired up later.
const IMAGE_EMBED_RE = /!\[([^\]]*)\]\(((?:data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+)|(?:https?:\/\/[^\s)]+))\)/g;

const IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg)$/i;
const PDF_EXT = /\.pdf$/i;

function isImage(name: string): boolean {
  return IMAGE_EXT.test(name);
}

function isPdf(name: string): boolean {
  return PDF_EXT.test(name);
}

function AttachmentCard({ name, isOwn, language }: { name: string; isOwn: boolean; language: 'ru' | 'uz' }) {
  const bg = isOwn ? 'bg-white/20' : 'bg-gray-100';
  const iconColor = isOwn ? 'text-white' : 'text-gray-500';
  const textColor = isOwn ? 'text-white' : 'text-gray-800';
  const metaColor = isOwn ? 'text-white/70' : 'text-gray-500';

  const Icon = isImage(name) ? ImageIcon : isPdf(name) ? FileText : FileIcon;
  const kind = isImage(name)
    ? (language === 'ru' ? 'Изображение' : 'Rasm')
    : isPdf(name)
      ? (language === 'ru' ? 'PDF документ' : 'PDF hujjat')
      : (language === 'ru' ? 'Файл' : 'Fayl');

  return (
    <div className={`flex items-center gap-2 my-1 px-2.5 py-2 rounded-[12px] ${bg}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? 'bg-white/20' : 'bg-white'}`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-medium truncate ${textColor}`}>{name}</div>
        <div className={`text-[11px] ${metaColor}`}>{kind}</div>
      </div>
    </div>
  );
}

type Part =
  | { type: 'text'; value: string }
  | { type: 'attachment'; name: string }
  | { type: 'image'; alt: string; src: string };

export function MessageContent({ content, isOwn, language }: MessageContentProps) {
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  IMAGE_EMBED_RE.lastIndex = 0;
  ATTACHMENT_RE.lastIndex = 0;
  const hasImageEmbed = IMAGE_EMBED_RE.test(content);
  IMAGE_EMBED_RE.lastIndex = 0;
  const hasAttachment = ATTACHMENT_RE.test(content);
  ATTACHMENT_RE.lastIndex = 0;

  // Fast path: plain text
  if (!hasImageEmbed && !hasAttachment) {
    return (
      <p className="text-[14px] whitespace-pre-wrap leading-relaxed" style={{ wordBreak: 'break-word' }}>
        {content}
      </p>
    );
  }

  // First split out image embeds so we can render them as <img>. Then run
  // the attachment-card parser on each remaining text fragment.
  const imageParts: Array<{ type: 'text'; value: string } | { type: 'image'; alt: string; src: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMAGE_EMBED_RE.exec(content)) !== null) {
    if (m.index > lastIndex) imageParts.push({ type: 'text', value: content.slice(lastIndex, m.index) });
    imageParts.push({ type: 'image', alt: m[1] || 'image', src: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) imageParts.push({ type: 'text', value: content.slice(lastIndex) });

  const finalParts: Part[] = [];
  for (const ip of imageParts) {
    if (ip.type === 'image') {
      finalParts.push(ip);
      continue;
    }
    // Re-run attachment regex against this text chunk
    ATTACHMENT_RE.lastIndex = 0;
    let inner = 0;
    let am: RegExpExecArray | null;
    while ((am = ATTACHMENT_RE.exec(ip.value)) !== null) {
      if (am.index > inner) finalParts.push({ type: 'text', value: ip.value.slice(inner, am.index) });
      finalParts.push({ type: 'attachment', name: am[1] });
      inner = am.index + am[0].length;
    }
    if (inner < ip.value.length) finalParts.push({ type: 'text', value: ip.value.slice(inner) });
  }

  return (
    <div className="text-[14px] leading-relaxed" style={{ wordBreak: 'break-word' }}>
      {lightboxImage && (
        <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} />
      )}
      {finalParts.map((p, i) => {
        if (p.type === 'image') {
          return (
            <img
              key={i}
              src={p.src}
              alt={p.alt}
              loading="lazy"
              onClick={() => setLightboxImage({ src: p.src, alt: p.alt })}
              className="my-1 rounded-[12px] max-w-full max-h-[320px] object-contain bg-black/5 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all"
            />
          );
        }
        if (p.type === 'attachment') {
          return <AttachmentCard key={i} name={p.name} isOwn={isOwn} language={language} />;
        }
        const trimmed = p.value.replace(/^\s+|\s+$/g, '');
        if (!trimmed) return null;
        return (
          <p key={i} className="whitespace-pre-wrap">
            {p.value}
          </p>
        );
      })}
    </div>
  );
}
