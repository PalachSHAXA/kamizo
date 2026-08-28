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

import { describe, it, expect, afterEach } from 'vitest';
import {
  classifyZhkhMessage, SUGGESTION_THRESHOLD, detectLanguage, categoryLabel,
  applyDictionaryOverrides,
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

  describe('разговорные формы', () => {
    it.each([
      'нету света на площадке',          // «нету» вместо «нет»
      'нету воды со вчера',
      'свет вырубило в подъезде',
      'лампочка потухла',
      'из трубы хлещет вода',
      'соседи подтопили, с потолка льёт',
    ])('ловит: %s', (text) => {
      expect(fires(text)).toBe(true);
    });

    it('«нету» без темы не срабатывает', () => {
      expect(fires('нету времени этим заниматься')).toBe(false);
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

    // Сторож против самой коварной ошибки этого классификатора.
    //
    // Нормализация удаляет пробелы, поэтому короткий корень совпадает и
    // в СЕРЕДИНЕ чужого слова. Так узбекское «том» (крыша) срабатывало
    // внутри русского «пятом», а «бор» — внутри «забор» и «выбор».
    // Каждый новый короткий корень надо проверять на этот класс.
    it.each([
      'Встретимся на пятом этаже',
      'Мы уже сделали выбор',
      'Забор во дворе покрасили',
      'Потом обсудим на собрании',
      'В этом доме живёт мой брат',
    ])('короткий корень не ловится внутри чужого слова: %s', (text) => {
      expect(fires(text)).toBe(false);
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

// ── Находки прогона по корпусу ───────────────────────────────────────
//
// Всё ниже найдено не умозрительно, а прогоном 138 сообщений, похожих на
// настоящий домовой чат (scripts/classify-corpus.ts). Каждый случай —
// класс ошибки, а не единичная фраза, поэтому и закреплён тестом.
describe('находки корпусного прогона', () => {
  // Стоп-маркер по корню не различает времена. 'tuzatib' («починив»)
  // стоял рядом с 'tuzatildi' («починили»), но живёт он в обороте
  // «tuzatib bering» — «почините, пожалуйста». То есть глушил самую
  // вежливую форму жалобы.
  it('вежливая просьба по-узбекски не считается благодарностью', () => {
    expect(fires('Lift ishlamayapti, tuzatib bering iltimos')).toBe(true);
    expect(fires('Kran sindi, tuzatib bering')).toBe(true);
  });

  it('но благодарность прошедшим временем по-прежнему гасится', () => {
    expect(fires('Rahmat, tuzatishdi')).toBe(false);
    expect(fires('Rahmat, liftni tuzatib berishdi')).toBe(false);
  });

  // Беглая гласная: корень 'потолк' не покрывает именительный падеж,
  // а жалуются именно им. Тот же класс — любой корень на -ок/-ек.
  it('именительный падеж с беглой гласной ловится', () => {
    expect(fires('Из-под ванны у соседей сверху капает, у меня потолок мокрый')).toBe(true);
    expect(fires('Потолок мокрый после соседей')).toBe(true);
  });

  // Объявление УК содержит и тему, и симптом. Без стоп-маркера бот
  // предлагал заявку в ответ на собственное объявление.
  it('объявление о плановых работах не считается заявкой', () => {
    expect(fires('Завтра отключение воды с 9 до 17 по всему дому')).toBe(false);
    expect(fires('Уважаемые жители, плановые работы на теплотрассе')).toBe(false);
  });

  // Но жалоба на то же самое — заявка. Граница узкая намеренно.
  it('стоп-маркер объявления не глушит жалобу на отключение', () => {
    expect(classifyZhkhMessage('Отключение воды с 9 до 17')).toBeNull();
    expect(fires('Спасибо, воду дали')).toBe(false);
  });

  // Узбекская кириллица без ў/қ/ғ/ҳ уходила как русская, и житель
  // получал ответ не на своём языке.
  it('узбекскую кириллицу без особых букв определяет по корням', () => {
    expect(detectLanguage('Лифт ишламайди, туртинчи кун')).toBe('uz');
    expect(detectLanguage('Домофон бузилган')).toBe('uz');
  });

  // Обратная сторона тех же корней: они не должны сидеть внутри
  // русских слов. «кун» сюда добавить нельзя — «секунда», «окунь».
  it.each([
    'Прошло десять секунд',
    'Окунь клюёт на червя',
    'Лифт не работает',
  ])('русский текст не уезжает в узбекский: %s', (text) => {
    expect(detectLanguage(text)).toBe('ru');
  });
});

// ── Правки словаря из интерфейса (миграция 079) ──────────────────────
describe('правки словаря', () => {
  // Каждый тест возвращает состояние к встроенному: словари живут в
  // модуле, и незачищенная правка утекла бы в соседний тест.
  afterEach(() => applyDictionaryOverrides());

  const NONE = {
    topics: {}, symptoms: [], negative: [],
    disabled: { topics: [], symptoms: [], negative: [] },
  };

  it('добавленная тема начинает ловить', () => {
    // «Жёлоб» во встроенном словаре отсутствует — база молчит.
    expect(fires('Жёлоб забился')).toBe(false);
    applyDictionaryOverrides({ ...NONE, topics: { garbage: ['желоб'] } });
    expect(fires('Жёлоб забился')).toBe(true);
  });

  it('добавленный стоп-маркер выключает срабатывание', () => {
    expect(fires('В подъезде течёт труба')).toBe(true);
    applyDictionaryOverrides({ ...NONE, negative: ['в подъезде'] });
    expect(fires('В подъезде течёт труба')).toBe(false);
  });

  it('отключённый встроенный корень перестаёт работать', () => {
    expect(fires('Лифт не работает')).toBe(true);
    applyDictionaryOverrides({
      ...NONE,
      disabled: { topics: ['лифт'], symptoms: [], negative: [] },
    });
    // Тема снята — «не работает» остаётся симптомом без темы.
    expect(fires('Лифт не работает')).toBe(false);
  });

  it('пустая дельта возвращает встроенное состояние', () => {
    applyDictionaryOverrides({ ...NONE, negative: ['в подъезде'] });
    expect(fires('В подъезде течёт труба')).toBe(false);
    applyDictionaryOverrides();
    expect(fires('В подъезде течёт труба')).toBe(true);
  });

  it('дубль не удваивает вклад в уверенность', () => {
    const before = classifyZhkhMessage('Лифт не работает')!.confidence;
    applyDictionaryOverrides({ ...NONE, topics: { elevator: ['лифт'] } });
    expect(classifyZhkhMessage('Лифт не работает')!.confidence).toBe(before);
  });
});
