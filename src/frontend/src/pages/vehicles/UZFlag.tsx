// UZ Flag component - responsive
export function UZFlag({ className = 'w-8 h-5 sm:w-12 sm:h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className}>
      <rect width="30" height="6.67" fill="#1EB53A" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <rect y="13.33" width="30" height="6.67" fill="#0099B5" />
      <rect y="6.17" width="30" height="1" fill="#CE1126" />
      <rect y="12.83" width="30" height="1" fill="#CE1126" />
      <circle cx="8" cy="3.33" r="2" fill="#FFFFFF" />
      <circle cx="9" cy="3.33" r="2" fill="#0099B5" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
        <circle
          key={i}
          cx={14 + (i % 4) * 2.5}
          cy={1.5 + Math.floor(i / 4) * 2}
          r="0.6"
          fill="#FFFFFF"
        />
      ))}
    </svg>
  );
}
