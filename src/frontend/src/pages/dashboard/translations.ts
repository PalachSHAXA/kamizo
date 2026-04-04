const TRANSLATIONS: Record<string, Record<string, string>> = {
  'director.title': { ru: 'Обзор компании', uz: 'Kompaniya sharhi' },
  'director.subtitle': { ru: 'Ключевые показатели и статистика', uz: 'Asosiy ko\'rsatkichlar va statistika' },
  'director.refresh': { ru: 'Обновить', uz: 'Yangilash' },
  'director.requests': { ru: 'Заявки', uz: 'Arizalar' },
  'director.new': { ru: 'Новые', uz: 'Yangi' },
  'director.inProgress': { ru: 'В работе', uz: 'Jarayonda' },
  'director.completed': { ru: 'Выполнено', uz: 'Bajarildi' },
  'director.thisWeek': { ru: 'за неделю', uz: 'hafta uchun' },
  'director.staff': { ru: 'Сотрудники', uz: 'Xodimlar' },
  'director.online': { ru: 'Онлайн', uz: 'Onlayn' },
  'director.avgRating': { ru: 'Средний рейтинг', uz: 'O\'rtacha reyting' },
  'director.buildings': { ru: 'Комплексы', uz: 'Komplekslar' },
  'director.residents': { ru: 'Жители', uz: 'Aholisi' },
  'director.meetings': { ru: 'Собрания', uz: 'Yig\'ilishlar' },
  'director.active': { ru: 'Активные', uz: 'Faol' },
  'director.announcements': { ru: 'Объявления', uz: 'E\'lonlar' },
  'director.byBuilding': { ru: 'По комплексам', uz: 'Komplekslar bo\'yicha' },
  'director.byDepartment': { ru: 'По отделам', uz: 'Bo\'limlar bo\'yicha' },
  'director.topPerformers': { ru: 'Лучшие сотрудники', uz: 'Eng yaxshi xodimlar' },
  'director.completionRate': { ru: 'Выполнение', uz: 'Bajarish' },
  'director.pending': { ru: 'Ожидает', uz: 'Kutmoqda' },
  'director.viewAll': { ru: 'Смотреть все', uz: 'Hammasini ko\'rish' },
  'director.recentRequests': { ru: 'Последние заявки', uz: 'So\'nggi arizalar' },
  'director.staffList': { ru: 'Список сотрудников', uz: 'Xodimlar ro\'yxati' },
  'director.buildingsList': { ru: 'Список комплексов', uz: 'Komplekslar ro\'yxati' },
  'director.activityDetails': { ru: 'Активность', uz: 'Faollik' },
  // Marketplace translations
  'director.overview': { ru: 'Обзор', uz: 'Umumiy' },
  'director.marketplace': { ru: 'Маркетплейс', uz: 'Marketplace' },
  'director.marketplaceReport': { ru: 'Отчёт по маркетплейсу', uz: 'Marketplace hisoboti' },
  'director.period': { ru: 'Период', uz: 'Davr' },
  'director.download': { ru: 'Скачать Excel', uz: 'Excel yuklab olish' },
  'director.totalOrders': { ru: 'Всего заказов', uz: 'Jami buyurtmalar' },
  'director.delivered': { ru: 'Доставлено', uz: 'Yetkazildi' },
  'director.cancelled': { ru: 'Отменено', uz: 'Bekor qilindi' },
  'director.revenue': { ru: 'Выручка', uz: 'Daromad' },
  'director.deliveryFees': { ru: 'Доставка', uz: 'Yetkazish' },
  'director.topProducts': { ru: 'Топ товаров', uz: 'Top mahsulotlar' },
  'director.sold': { ru: 'Продано', uz: 'Sotildi' },
  'director.orders': { ru: 'Заказов', uz: 'Buyurtmalar' },
  'director.byCategory': { ru: 'По категориям', uz: 'Kategoriyalar bo\'yicha' },
  'director.salesChart': { ru: 'Динамика продаж', uz: 'Sotuvlar dinamikasi' },
  'director.topCustomers': { ru: 'Топ покупателей', uz: 'Top xaridorlar' },
  'director.spent': { ru: 'Потрачено', uz: 'Sarflangan' },
  'director.couriers': { ru: 'Курьеры', uz: 'Kuryerlar' },
  'director.deliveredCount': { ru: 'Доставок', uz: 'Yetkazishlar' },
  'director.noData': { ru: 'Нет данных', uz: 'Ma\'lumot yo\'q' },
  'director.loading': { ru: 'Загрузка...', uz: 'Yuklanmoqda...' },
  // Ratings translations
  'director.ratings': { ru: 'Отчёты', uz: 'Hisobotlar' },
  'director.ukSatisfaction': { ru: 'Удовлетворённость жителей', uz: 'Aholining qoniqishi' },
  'director.overallRating': { ru: 'Общая оценка', uz: 'Umumiy baho' },
  'director.cleanliness': { ru: 'Чистота', uz: 'Tozalik' },
  'director.responsiveness': { ru: 'Реагирование', uz: 'Javob berish' },
  'director.communication': { ru: 'Коммуникация', uz: 'Muloqot' },
  'director.trend': { ru: 'Тренд', uz: 'Trend' },
  'director.vsLastMonth': { ru: 'vs прошлый месяц', uz: 'o\'tgan oyga nisbatan' },
  'director.betterThan': { ru: 'лучше чем', uz: 'yaxshiroq' },
  'director.worseThan': { ru: 'хуже чем', uz: 'yomonroq' },
  'director.lastMonth': { ru: 'прошлый месяц', uz: 'o\'tgan oy' },
  'director.monthlyTrend': { ru: 'Динамика по месяцам', uz: 'Oylik dinamika' },
  'director.recentComments': { ru: 'Последние отзывы', uz: 'So\'nggi sharhlar' },
  'director.noRatingsYet': { ru: 'Оценок пока нет', uz: 'Hali baholar yo\'q' },
  'director.totalVotes': { ru: 'голосов', uz: 'ovozlar' },
  'director.recommendations': { ru: 'Рекомендации', uz: 'Tavsiyalar' },
};

export function createTranslator(language: string) {
  return (key: string): string => {
    return TRANSLATIONS[key]?.[language] || key;
  };
}

export function getRequestStatusLabels(language: string): Record<string, string> {
  return {
    new: language === 'ru' ? 'Новая' : 'Yangi',
    assigned: language === 'ru' ? 'Назначена' : 'Tayinlangan',
    accepted: language === 'ru' ? 'Принята' : 'Qabul qilindi',
    in_progress: language === 'ru' ? 'В работе' : 'Jarayonda',
    pending_approval: language === 'ru' ? 'На проверке' : 'Tekshiruvda',
    completed: language === 'ru' ? 'Выполнена' : 'Bajarildi',
    cancelled: language === 'ru' ? 'Отменена' : 'Bekor qilindi',
  };
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'new': return 'bg-blue-100 text-blue-700';
    case 'assigned': return 'bg-yellow-100 text-yellow-700';
    case 'in_progress': return 'bg-orange-100 text-orange-700';
    case 'completed': return 'bg-green-100 text-green-700';
    case 'pending_approval': return 'bg-purple-100 text-purple-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}
