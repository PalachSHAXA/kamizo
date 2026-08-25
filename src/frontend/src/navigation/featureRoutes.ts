// Карта «фича тенанта → маршруты, которые она открывает».
//
// Один источник истины для двух решений, которые обязаны совпадать:
//   • Sidebar — рисовать ли на пункте меню замок (и открывать
//     FeatureLockedModal вместо перехода);
//   • ProtectedRoute — пускать ли на маршрут.
//
// Когда карта расходится с requiredFeature на самом <Route>, получается
// худшая комбинация: пункт меню выглядит рабочим, клик уводит на
// маршрут, гейт молча возвращает на главную. Ровно так вёл себя пункт
// «Модерация объявлений» — /rentals-moderation гейтился фичей
// rental_listings, а в карте его не было вовсе.
// Расхождение ловит src/navigation/__tests__/featureRoutes.test.ts.
export const FEATURE_PATHS: Record<string, string[]> = {
  'requests': ['/', '/requests', '/executors', '/work-orders', '/schedule', '/my-stats'],
  'meetings': ['/meetings'],
  'qr': ['/qr-scanner', '/guest-access'],
  'chat': ['/chat'],
  'marketplace': ['/marketplace', '/marketplace-orders', '/marketplace-products'],
  'announcements': ['/announcements'],
  'trainings': ['/trainings'],
  'rentals': ['/rentals'],
  'rental_listings': ['/rentals-moderation'],
  'colleagues': ['/colleagues'],
  'vehicles': ['/vehicles', '/vehicle-search'],
  'useful-contacts': ['/useful-contacts'],
  'notepad': ['/notepad'],
  'communal': ['/finance/estimates', '/finance/charges', '/finance/debtors', '/finance/income', '/finance/expenses', '/finance/materials', '/finance/settings'],
};

/** Фича, закрывающая путь, или null — если путь не гейтится. */
export function featureForPath(path: string): string | null {
  for (const [feature, paths] of Object.entries(FEATURE_PATHS)) {
    if (paths.includes(path)) return feature;
  }
  return null;
}
