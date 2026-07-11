#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Kamizo — auto-cancel expired on-demand marketplace price offers.
#
# Runs from the systemd timer kamizo-marketplace-expire-offers.timer
# (default: every 15 min). Finds заявки under спецпоставке (on-demand)
# which the УК уже назвала цену жителю, но житель не ответил в
# течение 24 часов — переводит их в cancelled с фиксированным
# cancellation_reason и пишет строку в marketplace_order_history.
#
# Модели двух режимов:
#   DRY_RUN=1  — только SELECT, вывод в journal, БЕЗ UPDATE.
#                Используется перед первой боевой активацией и после
#                любого изменения скрипта, чтобы убедиться, что
#                выбраны ровно нужные строки.
#   (default)  — реальный прогон.
#
# Safety:
#   • WAL режим SQLite позволяет читать + писать одновременно с
#     kamizo-api.service — без блокировок.
#   • UPDATE-precondition `AND status='price_offered'` защищает от
#     race с ручной отменой оператором в тот же миг.
#   • `changes() = 1` в INSERT'е history пишет строку только когда
#     UPDATE реально прошёл — не дублируем историю, если оператор
#     опередил.
#   • Скрипт полностью idempotent: второй запуск подряд ничего не
#     делает (нет ни одной строки со status='price_offered' + expired).
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DB=/opt/kamizo/data/kamizo.db
DRY_RUN="${DRY_RUN:-0}"

if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY-RUN] no writes will be performed"
fi

# Читаем список кандидатов до UPDATE — нужен для журнала и для
# истории. `-separator '|'` даёт стабильно парсимый вывод; на всякий
# случай `-noheader` (в этой версии sqlite3 default = без header, но
# явно указываем).
mapfile -t EXPIRED < <(sqlite3 -noheader -separator '|' "$DB" \
  "SELECT id, tenant_id, order_number, price_offered_expires_at
     FROM marketplace_orders
    WHERE status='price_offered'
      AND price_offered_expires_at IS NOT NULL
      AND price_offered_expires_at < datetime('now');")

if [ ${#EXPIRED[@]} -eq 0 ]; then
  echo "no expired price_offered orders found"
  exit 0
fi

echo "found ${#EXPIRED[@]} expired price_offered order(s)"

for row in "${EXPIRED[@]}"; do
  IFS='|' read -r ID TENANT ORDER_NUMBER EXPIRES_AT <<< "$row"
  echo "  → $ORDER_NUMBER  (id=$ID, tenant=$TENANT, expired_at=$EXPIRES_AT UTC)"

  if [ "$DRY_RUN" = "1" ]; then
    continue
  fi

  HIST_ID=$(uuidgen)
  # Транзакция — UPDATE + INSERT history атомарно.
  # `WHERE changes() = 1` в INSERT: если UPDATE ничего не тронул
  # (concurrent manual cancel), history тоже не пишем — иначе будет
  # дубль записи "cancelled" в истории того же заказа.
  sqlite3 "$DB" <<SQL
BEGIN IMMEDIATE;
UPDATE marketplace_orders
   SET status = 'cancelled',
       cancelled_at = datetime('now'),
       cancellation_reason = 'Истёк срок ответа на цену (24 ч)',
       updated_at = datetime('now')
 WHERE id = '$ID'
   AND status = 'price_offered';

INSERT INTO marketplace_order_history
       (id, order_id, status, comment, changed_by, tenant_id)
SELECT '$HIST_ID', '$ID', 'cancelled',
       'Автоотмена: истёк срок ответа на цену (24 ч)',
       NULL, '$TENANT'
 WHERE changes() = 1;
COMMIT;
SQL
done

if [ "$DRY_RUN" = "1" ]; then
  echo "[DRY-RUN] done — no changes committed"
else
  echo "done"
fi
