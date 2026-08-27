// Тесты классификатора ЖКХ-сообщений (§11 ТЗ).
//
// Зачем они здесь: словари растут, а проверить руками, что очередной
// добавленный корень не начал ловить половину чата, невозможно. Особенно
// после нормализации, которая склеивает слова, — именно она может дать
// неочевидное ложное совпадение.
//
// Отрицательные проверки тут важнее положительных. Пропущенное
// сообщение о протечке житель оформит заявкой руками; ложное
// предложение в домовом чате раздражает всех и заканчивается тем, что
// администратор выключает слушателя.

import { describe, it, expect } from 'vitest';
import {
  classifyZhkhMessage, SUGGESTION_THRESHOLD, detectLanguage, categoryLabel,
} from '../zhkh-classifier';

/** Сработал ли бот, то есть прошло ли сообщение порог. */
const fires = (text: string) => {
  const r = classifyZhkhMessage(text);
  return !!r && r.confidence >= SUGGESTION_THRESHOLD;
};

describe('классификатор ЖКХ', () => {
  describe('примеры из ТЗ §11', () => {
    it('молчит на вопросе «где купить кран»', () => {
      expect(fires('Кто знает, где купить хороший кран?')).toBe(false);
    });

    it('срабатывает на «течёт кран»', () => {
      expect(fires('В третьем подъезде на первом этаже течёт кран.')).toBe(true);
    });
  });

  describe('русский', () => {
    it.each([
      'В подъезде течёт труба',
      'Лифт не работает второй день',
      'Нет света в подъезде',
      'Канализация засорилась, воняет',
      'Батареи холодные, отопление не работает',
      'Мусорные контейнеры переполнены',
      'Лампочка не горит на площадке',
      'Домофон сломан',
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });

    it.each([
      'Когда включат отопление?',
      'Спасибо, лифт починили',
      'Продам стиральную машину недорого',
      'Сдаю квартиру на длительный срок',
      'Подскажите где найти хорошего сантехника',
      'Всё работает, спасибо УК',
    ])('молчит: %s', (text) => {
      expect(fires(text)).toBe(false);
    });
  });

  describe('опечатки и слитное написание', () => {
    it.each([
      'лифт неработает',                 // без пробела
      'в подъезде тичет труба',          // и→е
      'канализацыя засарилась',          // две ошибки разом
      'атопление не работает',           // о→а
      'трубу прарвало в подвале',        // о→а
      'кран теччёт',                     // удвоение
      'света   нет   в  подъезде',       // лишние пробелы
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });
  });

  describe('узбекский латиницей', () => {
    it.each([
      'Podezdda suv oqyapti',            // в подъезде течёт вода
      'Lift ishlamayapti',               // лифт не работает
      'Svet yoʻq',                       // нет света
      'Kanalizatsiya tiqilib qoldi',     // канализация засорилась
      'Batareya sovuq, isitish yoq',     // батарея холодная
      'Axlat konteyner tolib ketdi',     // мусорка переполнена
      'Domofon buzilgan',                // домофон сломан
      'Kran sindi',                      // кран сломался
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });

    it('понимает апостроф в любом начертании', () => {
      // oʻ (модификатор), o' (обычный) и просто o должны совпадать.
      expect(fires('Svet yoʻq')).toBe(true);
      expect(fires("Svet yo'q")).toBe(true);
      expect(fires('Svet yoq')).toBe(true);
    });

    it.each([
      'Rahmat, tuzatishdi',              // спасибо, починили
      'Kvartira sotiladi',               // продаётся квартира
      'Kim biladi, kran qayerdan olsa boladi?',
    ])('молчит: %s', (text) => {
      expect(fires(text)).toBe(false);
    });
  });

  describe('узбекский кириллицей', () => {
    it.each([
      'Подездда сув оқяпти',
      'Лифт ишламайди',
      'Чироқ йўқ',
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });

    it('молчит на благодарности', () => {
      expect(fires('Раҳмат, лифт ишлаяпти')).toBe(false);
    });
  });

  describe('категории', () => {
    it.each([
      ['В квартире течёт кран', 'leak'],
      ['Канализацию засорило', 'sewage'],
      ['Нет света в квартире', 'electricity'],
      ['Лифт застрял между этажами', 'elevator'],
      ['Батареи холодные', 'heating'],
      ['Мусор не вывозят, контейнер переполнен', 'garbage'],
      ['Лампочка перегорела, не горит', 'lighting'],
    ])('%s → %s', (text, category) => {
      expect(classifyZhkhMessage(text)?.category).toBe(category);
    });
  });

  describe('определение языка', () => {
    it.each([
      'Podezdda suv oqyapti',
      'Lift ishlamayapti',
      'Чироқ йўқ',                       // узбекская кириллица: ў, қ
      'Batareya sovuq',
    ])('узбекский: %s', (text) => {
      expect(detectLanguage(text)).toBe('uz');
    });

    it.each([
      'В подъезде течёт труба',
      'Лифт не работает',
      'Нет света на площадке',
    ])('русский: %s', (text) => {
      expect(detectLanguage(text)).toBe('ru');
    });

    it('узбекскую кириллицу отличает от русского по буквам ў/қ/ғ/ҳ', () => {
      // В русском этих букв нет вовсе — признак стопроцентный.
      expect(detectLanguage('Лифт бузуқ')).toBe('uz');
      expect(detectLanguage('Лифт сломан')).toBe('ru');
    });

    it('смешанную фразу относит к узбекскому по служебным словам', () => {
      expect(detectLanguage('в подъезде suv yoq')).toBe('uz');
    });

    it('классификация возвращает язык вместе с категорией', () => {
      expect(classifyZhkhMessage('Lift ishlamayapti')?.lang).toBe('uz');
      expect(classifyZhkhMessage('Лифт не работает')?.lang).toBe('ru');
    });

    it('подписи категорий переводятся', () => {
      expect(categoryLabel('leak', 'ru')).toBe('протечке');
      expect(categoryLabel('leak', 'uz')).toBe('suv oqishi');
    });
  });

  describe('узбекские опечатки', () => {
    it.each([
      'Lift ishlamayapti',
      'Kanalizatsia tikilib koldi',      // q→k дважды
      'Suv okyapti podezdda',            // oqyapti → okyapti
      'Chirok yonmaydi',                 // chiroq → chirok
      'Axlat konteyner tulib ketdi',     // tolib → tulib
      'Domofon buzuk',                   // buzuq → buzuk
      'Xid kelyapti kanalizatsiyadan',   // hid → xid
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });
  });

  describe('границы', () => {
    it('игнорирует пустое', () => {
      expect(classifyZhkhMessage('')).toBeNull();
      expect(classifyZhkhMessage('   ')).toBeNull();
    });

    it('игнорирует простыни длиннее 400 символов', () => {
      const long = 'В подъезде течёт труба. '.repeat(30);
      expect(long.length).toBeGreaterThan(400);
      expect(classifyZhkhMessage(long)).toBeNull();
    });

    it('не срабатывает на теме без симптома', () => {
      // Тема есть, поломки нет — это обсуждение, а не заявка.
      expect(fires('Сегодня привезли новые мусорные контейнеры')).toBe(false);
    });

    it('не срабатывает на симптоме без темы', () => {
      expect(fires('Сосед сломал мою машину во дворе')).toBe(false);
    });

    it.each([
      'На улице сегодня холодно',
      'Вечером во дворе темно, гулять страшно',
      'Bugun tashqarida sovuq',
    ])('не путает погоду с поломкой: %s', (text) => {
      // «холодно» и «темно» — симптомы, а не темы. Иначе фраза про
      // погоду давала бы и то и другое разом и срабатывала бы впустую.
      expect(fires(text)).toBe(false);
    });

    it('уверенность растёт с числом совпадений', () => {
      const weak = classifyZhkhMessage('Кран сломан')!;
      const strong = classifyZhkhMessage('Течёт труба, кран протекает, вода везде')!;
      expect(strong.confidence).toBeGreaterThan(weak.confidence);
      expect(strong.confidence).toBeLessThanOrEqual(1);
    });
  });
});
