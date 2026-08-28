// Стык двух словарей: категорий классификатора и специализаций
// исполнителей.
//
// До этого теста они соприкасались молча. Эндпоинт черновика отдавал
// 'leak', форма заявки ждала 'plumber', и совпадали они случайно только
// на 'elevator' и 'cleaning'. Житель, пришедший из группы по протечке,
// создавал заявку с категорией, которой нет ни в одной строке
// categories, — маршрутизация по specialization не находила исполнителя,
// и заявка повисала.
//
// Ошибка была не в коде, а в том, что стык нигде не проверялся: оба
// словаря корректны по отдельности. Тест закрывает именно это.

import { describe, it, expect } from 'vitest';
import { SPECIALIZATION_BY_CATEGORY } from '../dispatcher';

// Зеркало SERVICE_CATEGORIES и SPECIALIZATION_LABELS из фронтенда
// (src/frontend/src/types/request.ts). Добавили специализацию там —
// добавьте и здесь, иначе тест не заметит расхождения.
const KNOWN_SPECIALIZATIONS = [
  'plumber', 'electrician', 'elevator', 'intercom', 'cleaning', 'security',
  'trash', 'boiler', 'ac', 'courier', 'gardener', 'other',
];

describe('категория бота → специализация исполнителя', () => {
  it('каждая категория ведёт в специализацию, известную приложению', () => {
    for (const [category, specialization] of Object.entries(SPECIALIZATION_BY_CATEGORY)) {
      expect(KNOWN_SPECIALIZATIONS, `категория ${category}`).toContain(specialization);
    }
  });

  // Record<ZhkhCategory, string> ловит пропуск на этапе компиляции, но
  // только при сборке. Проверка числом страхует на случай, если тип
  // когда-нибудь ослабят до Partial или string.
  it('покрыты все категории классификатора', () => {
    expect(Object.keys(SPECIALIZATION_BY_CATEGORY)).toHaveLength(9);
  });

  it('протечка и канализация идут к сантехнику, а не остаются собой', () => {
    expect(SPECIALIZATION_BY_CATEGORY.leak).toBe('plumber');
    expect(SPECIALIZATION_BY_CATEGORY.sewage).toBe('plumber');
  });
});
