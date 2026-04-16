import { FileText, Image as ImageIcon, FileIcon } from 'lucide-react';

interface MessageContentProps {
  content: string;
  isOwn: boolean;
  language: 'ru' | 'uz';
}

const ATTACHMENT_RE = /\[([^\[\]]+?\.(?:png|jpg|jpeg|gif|webp|svg|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|mp3|mp4|mov))\]/gi;

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

export function MessageContent({ content, isOwn, language }: MessageContentProps) {
  // Fast path: no attachment pattern → just render text
  if (!content.includes('[') || !ATTACHMENT_RE.test(content)) {
    ATTACHMENT_RE.lastIndex = 0;
    return (
      <p className="text-[14px] whitespace-pre-wrap leading-relaxed" style={{ wordBreak: 'break-word' }}>
        {content}
      </p>
    );
  }

  ATTACHMENT_RE.lastIndex = 0;
  const parts: Array<{ type: 'text'; value: string } | { type: 'attachment'; name: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ATTACHMENT_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'attachment', name: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return (
    <div className="text-[14px] leading-relaxed" style={{ wordBreak: 'break-word' }}>
      {parts.map((p, i) => {
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
