// Sprint 27: extracted from ColleaguesSection. The small "what's new"
// feed at the top of the page — top rating, thank-yous, department
// changes.

import { TrendingUp, MessageCircle } from 'lucide-react';
import type { NewsItem } from './types';

export function NewsFeed({ news }: { news: NewsItem[] }) {
  const { language } = useLanguageStore();
  return (
    <div className="glass-card p-4 sm:p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">{language === 'ru' ? 'Последние события' : "So'nggi voqealar"}</span>
      </h2>
      <div className="space-y-3">
        {news.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <MessageCircle className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm break-words">{item.text}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

