import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const here = dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = resolve(here, '../../App.tsx');

/** Комментарии выкидываем: <Layout /> упоминается и в них (история правок). */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('монтирование Layout', () => {
  // Layout держит собственный <Routes> с абсолютными путями. Такой
  // вложенный <Routes> матчится не от корня, а от пути родительского
  // <Route> — значит Layout можно монтировать только из маршрута "/*".
  // Смонтированный из точного пути (например "/announcements") он получит
  // остаток "/" и отрисует дашборд, оставив в адресе исходный путь: раздел
  // будет выглядеть как «молча выбросило на главную».
  it('монтируется ровно из одного маршрута, и это "/*"', () => {
    const source = stripComments(readFileSync(APP_SOURCE, 'utf8'));
    const mounts = [...source.matchAll(/<Layout\s*\/>/g)];

    expect(mounts).toHaveLength(1);

    const before = source.slice(0, mounts[0].index);
    const paths = [...before.matchAll(/path="([^"]+)"/g)];
    const parentPath = paths[paths.length - 1]?.[1];
    expect(parentPath).toBe('/*');
  });

  // Тот же инвариант, но проверенный самим роутером, а не регуляркой: если
  // React Router когда-нибудь начнёт разрешать такое вложение иначе, тест
  // это заметит.
  it('под точным путём вложенный <Routes> матчит "/" и рисует не тот экран', () => {
    function Nested() {
      return (
        <Routes>
          <Route path="/" element={<div>DASHBOARD</div>} />
          <Route path="/announcements" element={<div>ANNOUNCEMENTS</div>} />
        </Routes>
      );
    }

    const exact = render(
      <MemoryRouter initialEntries={['/announcements']}>
        <Routes>
          <Route path="/announcements" element={<Nested />} />
        </Routes>
      </MemoryRouter>
    );
    expect(exact.container.textContent).toBe('DASHBOARD');
    exact.unmount();

    const splat = render(
      <MemoryRouter initialEntries={['/announcements']}>
        <Routes>
          <Route path="/*" element={<Nested />} />
        </Routes>
      </MemoryRouter>
    );
    expect(splat.container.textContent).toBe('ANNOUNCEMENTS');
  });
});
