import { memo, useRef, useState, useEffect, useCallback } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number; // Высота одного элемента в пикселях
  containerHeight: number; // Высота контейнера в пикселях
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number; // Количество дополнительных элементов для рендера (для плавной прокрутки)
  className?: string;
}

/**
 * Виртуализированный список для рендеринга больших списков
 * Рендерит только видимые элементы + overscan
 *
 * Performance:
 * - 1000 items: рендерит только ~20 видимых вместо 1000
 * - 10000 items: рендерит только ~20 видимых вместо 10000
 * - Экономия: 98-99% меньше DOM nodes
 *
 * @example
 * <VirtualizedList
 *   items={requests}
 *   itemHeight={80}
 *   containerHeight={600}
 *   renderItem={(request) => <RequestCard key={request.id} request={request} />}
 * />
 */
function VirtualizedListInner<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  className = '',
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Обработчик прокрутки (мемоизирован)
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Вычисление видимых элементов
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, idx) => (
            <div key={startIndex + idx} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Мемоизируем весь компонент
export const VirtualizedList = memo(VirtualizedListInner) as typeof VirtualizedListInner;
