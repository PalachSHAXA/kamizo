import { Star } from 'lucide-react';

// Sprint 23: extracted from ColleaguesSection. The interactive star
// row used by RatingModal and the read-only display in employee
// cards. Pass `onChange` to make it editable.

export function StarRating({
  rating,
  maxStars = 5,
  size = 'md',
  onChange,
}: {
  rating: number;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className="flex gap-1">
      {[...Array(maxStars)].map((_, i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          } ${onChange ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
          onClick={() => onChange?.(i + 1)}
        />
      ))}
    </div>
  );
}
