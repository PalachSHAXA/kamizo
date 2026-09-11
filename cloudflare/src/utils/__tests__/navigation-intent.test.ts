import { describe, expect, it } from 'vitest';
import { classifyNavigationIntent } from '../navigation-intent';

describe('classifyNavigationIntent', () => {
  const cases: Array<[string, string]> = [
    ['Хочу сдать квартиру в аренду через Kamizo', 'rental_publish'],
    ['Ищу квартиру снять в нашем ЖК', 'rental_browse'],
    ['Kvartirani ijaraga bermoqchiman', 'rental_publish'],
    ['Ijaraga kvartira qidiryapman', 'rental_browse'],
    ['Нужна химчистка ковра', 'useful_contacts'],
    ['Kimyoviy tozalash xizmati kerak', 'useful_contacts'],
    ['Чья машина с номером 01A123BC?', 'vehicle_owner'],
    ['Чья машина стоит у подъезда?', 'vehicle_owner'],
    ['Чя машына с номером 01A123BC?', 'vehicle_owner'],
    ['01A123BC raqamli mashina egasi kim?', 'vehicle_owner'],
    ['Создать QR-пропуск курьеру', 'guest_pass'],
    ['Как прапустить гостя?', 'guest_pass'],
    ['Mehmon uchun QR ruxsat yaratish', 'guest_pass'],
    ['Где проверить гостевой пропуск QR?', 'qr_scan'],
    ['QR ruxsatnomani tekshirish kerak', 'qr_scan'],
    ['Открыть Маркет УК, хочу заказать товар', 'marketplace'],
    ['Где купть лампочку?', 'marketplace'],
    ['Что умеет бот?', 'assistant_help'],
    ['Нужна химчиска мебели', 'useful_contacts'],
    ['Хачу сдать квартру в аренду', 'rental_publish'],
    ['я машина', 'vehicle_menu'],
    ['машына', 'vehicle_menu'],
    ['пропуск', 'pass_menu'],
    ['квартира', 'rental_menu'],
    ['химчистка', 'useful_contacts'],
    ['купить лампочку', 'marketplace'],
    ['avto', 'vehicle_menu'],
    ['ulov', 'vehicle_menu'],
    ['mashina kimniki', 'vehicle_owner'],
    ['улов', 'vehicle_menu'],
    ['машина кимники', 'vehicle_owner'],
    ['автомобиль эгаси', 'vehicle_owner'],
    ['рухсатнома', 'pass_menu'],
    ['меҳмонни ўтказиш керак', 'guest_pass'],
    ['QR рухсатни текшириш', 'qr_scan'],
    ['ижарага квартира бераман', 'rental_publish'],
    ['ижарага квартира қидиряпман', 'rental_browse'],
    ['кимёвий тозалаш керак', 'useful_contacts'],
    ['қаердан лампочка сотиб оламан', 'marketplace'],
    ['Прошу убрать машину и не парковать так, словно вы одни живёте', 'parking_issue'],
    ['Посторонняя машина перекрыла въезд во двор', 'parking_issue'],
    ['Охрана не отвечает на телефон, откройте шлагбаум', 'barrier_issue'],
    ['Охрана телефонга жавоб бермайди, очиб юборинг', 'barrier_issue'],
    ['Предлагаю сделать систему умного шлагбаума с камерами и списком номеров жильцов', 'resident_proposal'],
    ['Шлагбаум учун камера ўрнатишни таклиф қиламан', 'resident_proposal'],
  ];

  it.each(cases)('%s -> %s', (text, expected) => {
    expect(classifyNavigationIntent(text)?.intent).toBe(expected);
  });

  it.each([
    'Во дворе стоит машина',
    'Квартира на пятом этаже',
    'Охрана сегодня работает?',
    'Магазин возле дома закрыт',
    'Течет труба, нужен сантехник',
    'https://example.com сдаю квартиру',
  ])('stays silent for ambiguous text: %s', text => {
    expect(classifyNavigationIntent(text)).toBeNull();
  });
});
