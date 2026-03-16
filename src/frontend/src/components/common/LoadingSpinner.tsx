import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullPage?: boolean;
  className?: string;
}

export function LoadingSpinner({
  size = 'md',
  text,
  fullPage = false,
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const content = (
    <div className={`flex flex-col items-center gap-4 ${fullPage ? 'h-64 justify-center' : ''} ${className}`}>
      <Loader2 className={`${sizeClasses[size]} text-gray-400 animate-spin`} />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );

  if (fullPage) {
    return <div className="flex items-center justify-center">{content}</div>;
  }

  return content;
}
