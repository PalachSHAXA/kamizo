import { useEffect } from 'react';
import { useTenantStore } from './tenantStore';

/**
 * Дёрнуть fetch/data-loader только если у тенанта включена нужная
 * feature. Ничего не глушит на клиенте — просто не отправляет запрос,
 * если backend всё равно вернёт 403 «Feature X is not available in
 * your plan».
 *
 * Мотивация: у боевого тенанта `my-humo` включено 4 фичи из 16
 * (chat, notepad, qr, requests). До этого хука Layout.tsx на mount
 * дёргал `fetchAnnouncements()` безусловно → 403 → красный toast
 * жителю. Тот же класс ошибок ждал каждого клиента на младшем тарифе.
 *
 * ВАЖНО: НЕ путать с ProtectedRoute — тот защищает роут (не даёт
 * попасть на страницу /announcements без feature). Здесь мы защищаем
 * mount-эффекты в chrome/dashboard/badge-счётчиках, которые
 * монтируются независимо от роута.
 *
 * Использование:
 *   useFeatureFetch('announcements', fetchAnnouncements);
 *   useFeatureFetch('marketplace', () => fetchOrders(), [user?.id]);
 *
 * @param feature — canonical feature slug из `tenants.features`
 * @param fn — что вызвать, когда фича включена
 * @param deps — дополнительные React-зависимости (кроме hasFeature)
 */
export function useFeatureFetch(
  feature: string,
  fn: () => void | Promise<void>,
  deps: unknown[] = []
): void {
  // Selector возвращает boolean → useEffect стабильно перезапускается
  // только когда состояние фичи реально меняется (после hydration
  // конфига тенанта). Не читаем сам fn — он в closure и его identity
  // нам не важна для триггера.
  const enabled = useTenantStore((s) => s.hasFeature(feature));
  useEffect(() => {
    if (!enabled) return;
    void fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}
