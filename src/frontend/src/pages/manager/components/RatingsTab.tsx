import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from '../../../components/LazyCharts';
import { Star, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import type { RatingsTabProps } from './types';

export function RatingsTab({
  ratingSummary,
  isLoadingRatings
}: RatingsTabProps) {
  const { language } = useLanguageStore();

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-lg font-semibold">{language === 'ru' ? 'Удовлетворённость жителей' : 'Aholining qoniqishi'}</h2>

      {isLoadingRatings ? (
        <div className="text-center text-gray-400 py-20">{language === 'ru' ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
      ) : !ratingSummary?.current ? (
        <div className="text-center text-gray-400 py-20">{language === 'ru' ? 'Оценок пока нет' : 'Hali baholar yo\'q'}</div>
      ) : (
        <>
          {/* Trend Banner */}
          {ratingSummary.trend !== 0 && (
            <div className={`rounded-xl p-4 flex items-center gap-3 ${
              ratingSummary.trend > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {ratingSummary.trend > 0 ? (
                <TrendingUp className="w-6 h-6 text-green-600 shrink-0" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-600 shrink-0" />
              )}
              <div>
                <div className={`text-[15px] font-bold ${ratingSummary.trend > 0 ? 'text-green-800' : 'text-red-800'}`}>
                  {ratingSummary.trend > 0 ? '+' : ''}{ratingSummary.trend.toFixed(1)}% {ratingSummary.trend > 0 ? (language === 'ru' ? 'лучше чем' : 'yaxshiroq') : (language === 'ru' ? 'хуже чем' : 'yomonroq')} {language === 'ru' ? 'прошлый месяц' : 'o\'tgan oy'}
                </div>
                <div className={`text-[12px] ${ratingSummary.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {language === 'ru' ? 'vs прошлый месяц' : 'o\'tgan oyga nisbatan'}
                </div>
              </div>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: language === 'ru' ? 'Общая оценка' : 'Umumiy baho', value: ratingSummary.current.avg_overall },
              { label: language === 'ru' ? 'Чистота' : 'Tozalik', value: ratingSummary.current.avg_cleanliness },
              { label: language === 'ru' ? 'Реагирование' : 'Javob berish', value: ratingSummary.current.avg_responsiveness },
              { label: language === 'ru' ? 'Коммуникация' : 'Muloqot', value: ratingSummary.current.avg_communication },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="text-[12px] text-gray-500 font-medium mb-1">{stat.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-extrabold text-gray-900">
                    {stat.value ? Number(stat.value).toFixed(1) : '\u2014'}
                  </span>
                  <span className="text-[13px] text-gray-400">/5</span>
                </div>
                {stat.value && (
                  <div className="mt-2 flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${s <= Math.round(Number(stat.value)) ? 'text-yellow-400' : 'text-gray-200'}`}
                        fill={s <= Math.round(Number(stat.value)) ? 'currentColor' : 'none'}
                        strokeWidth={s <= Math.round(Number(stat.value)) ? 0 : 1.5}
                      />
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  {ratingSummary.current.count || 0} {language === 'ru' ? 'голосов' : 'ovozlar'}
                </div>
              </div>
            ))}
          </div>

          {/* Monthly Trend Chart */}
          {ratingSummary.monthly?.length > 1 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Динамика по месяцам' : 'Oylik dinamika'}</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ratingSummary.monthly.map((m) => ({
                    period: m.period,
                    overall: Number(m.avg_overall || 0).toFixed(1),
                    count: m.count,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="overall" stroke="rgb(var(--brand-rgb))" fill="rgba(var(--brand-rgb), 0.1)" strokeWidth={2} name={language === 'ru' ? 'Общая оценка' : 'Umumiy baho'} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Рекомендации' : 'Tavsiyalar'}</h3>
            <div className="space-y-2">
              {(() => {
                const recs: { text: string; priority: 'high' | 'medium' | 'low' }[] = [];
                const c = ratingSummary.current;
                if (c.avg_responsiveness && Number(c.avg_responsiveness) < 3.5) {
                  recs.push({
                    text: language === 'ru'
                      ? 'Скорость реагирования ниже среднего. Рассмотрите оптимизацию процессов обработки заявок.'
                      : 'Javob berish tezligi o\'rtachadan past. Arizalarni ko\'rib chiqish jarayonlarini optimallashtiring.',
                    priority: 'high'
                  });
                }
                if (c.avg_cleanliness && Number(c.avg_cleanliness) < 3.5) {
                  recs.push({
                    text: language === 'ru'
                      ? 'Оценка чистоты ниже ожидаемого. Проверьте график уборки и контроль качества.'
                      : 'Tozalik bahosi kutilganidan past. Tozalash jadvalini va sifat nazoratini tekshiring.',
                    priority: 'high'
                  });
                }
                if (c.avg_communication && Number(c.avg_communication) < 3.5) {
                  recs.push({
                    text: language === 'ru'
                      ? 'Коммуникация требует улучшения. Улучшите информирование жителей о работах и событиях.'
                      : 'Muloqotni yaxshilash kerak. Aholini ishlar va tadbirlar haqida xabardor qilishni yaxshilang.',
                    priority: 'medium'
                  });
                }
                if (c.avg_overall && Number(c.avg_overall) >= 4.0) {
                  recs.push({
                    text: language === 'ru'
                      ? 'Отличный результат! Общая оценка выше 4.0 — продолжайте в том же духе.'
                      : 'Ajoyib natija! Umumiy baho 4.0 dan yuqori — shu tarzda davom eting.',
                    priority: 'low'
                  });
                }
                if (recs.length === 0) {
                  recs.push({
                    text: language === 'ru'
                      ? 'Показатели в норме. Продолжайте следить за качеством обслуживания.'
                      : 'Ko\'rsatkichlar normal. Xizmat sifatini nazorat qilishda davom eting.',
                    priority: 'low'
                  });
                }
                return recs.map((rec, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg ${
                    rec.priority === 'high' ? 'bg-red-50' : rec.priority === 'medium' ? 'bg-amber-50' : 'bg-green-50'
                  }`}>
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                      rec.priority === 'high' ? 'text-red-500' : rec.priority === 'medium' ? 'text-amber-500' : 'text-green-500'
                    }`} />
                    <span className="text-[13px] text-gray-700">{rec.text}</span>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Recent Comments */}
          {ratingSummary.recentComments?.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold mb-3">{language === 'ru' ? 'Последние отзывы' : 'So\'nggi sharhlar'}</h3>
              <div className="space-y-3">
                {ratingSummary.recentComments.map((comment, idx) => (
                  <div key={idx} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${s <= comment.overall ? 'text-yellow-400' : 'text-gray-200'}`}
                            fill={s <= comment.overall ? 'currentColor' : 'none'}
                            strokeWidth={s <= comment.overall ? 0 : 1.5}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400">{comment.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="text-[13px] text-gray-600">{comment.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
