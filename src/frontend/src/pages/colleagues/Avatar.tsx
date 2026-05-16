import { useState } from 'react';

// Sprint 23: extracted from ColleaguesSection. Avatar with initials
// fallback. Previously the raw <img> showed alt-text (e.g.
// "📷 Bobur Toshmat") whenever DiceBear failed to respond — which
// turned out to be common enough to warrant a local fallback.

const AVATAR_GRADIENTS = [
  'from-amber-400 to-orange-500',
  'from-lime-400 to-green-500',
  'from-teal-400 to-cyan-500',
  'from-sky-400 to-blue-500',
  'from-indigo-400 to-purple-500',
  'from-fuchsia-400 to-pink-500',
  'from-rose-400 to-red-500',
  'from-emerald-400 to-teal-500',
  'from-violet-400 to-indigo-500',
  'from-yellow-400 to-amber-500',
];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_GRADIENTS.length;
}

export function initialsOf(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  src,
  className,
  onClick,
}: {
  name: string;
  src: string;
  className?: string;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    const gradient = AVATAR_GRADIENTS[hashSeed(name)];
    return (
      <div
        onClick={onClick}
        className={`bg-gradient-to-br ${gradient} text-white font-bold flex items-center justify-center select-none ${className || ''}`}
        aria-label={name}
      >
        {initialsOf(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onClick={onClick}
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
