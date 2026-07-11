# deploy/

Инфраструктурные артефакты, живущие вне application-кода: systemd
units, установочные bash-скрипты. Не кладём в `cloudflare/scripts/`
(там уже есть свои штуки уровня приложения) и не в `src/`.

## systemd/kamizo-marketplace-expire-offers.\*

Auto-cancel заявок «под привоз» (on-demand), которые повисли в
`price_offered` после того, как УК назвала цену, а житель не
ответил в течение 24 часов (поле `price_offered_expires_at`).

**Что делает:**
- Каждые 15 минут SQL-транзакцией меняет `status='price_offered' →
  'cancelled'` для просроченных строк, ставит
  `cancellation_reason='Истёк срок ответа на цену (24 ч)'`, пишет
  запись в `marketplace_order_history` (system-actor: `changed_by=NULL`).
- Idempotent: второй прогон подряд ничего не делает.
- Race-safe с ручной отменой из менеджерского UI: `UPDATE`
  precondition + `WHERE changes()=1` в `INSERT` истории.

**Что НЕ делает (осознанно, на будущее):**
- Не шлёт push-уведомление жителю. Житель увидит статус через
  polling `activeOrders` (10 s). Push можно добавить отдельным
  этапом, когда сам скрипт признан стабильным.

## Установка на VPS 95.46.96.209

Одноразовая ручная процедура, как для `kamizo-backup-*`.

### 1. Копируем файлы

```bash
scp -i ~/.ssh/kamizo_vps \
  deploy/systemd/kamizo-marketplace-expire-offers.sh \
  deploy/systemd/kamizo-marketplace-expire-offers.service \
  deploy/systemd/kamizo-marketplace-expire-offers.timer \
  kamizo@95.46.96.209:/tmp/
```

### 2. DRY-RUN — обязательный первый шаг

Перед боевой активацией убеждаемся, что SELECT выбирает ровно
просроченные `price_offered` заявки, а не что-то ещё.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
sudo install -m 755 /tmp/kamizo-marketplace-expire-offers.sh /usr/local/bin/
sudo DRY_RUN=1 /usr/local/bin/kamizo-marketplace-expire-offers.sh
EOF
```

Ожидаемый вывод: `[DRY-RUN] no writes will be performed` → перечень
кандидатов → `[DRY-RUN] done — no changes committed`. Никаких
изменений в БД. Проверить руками:

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  "sqlite3 /opt/kamizo/data/kamizo.db \
   \"SELECT id, status FROM marketplace_orders \
     WHERE price_offered_expires_at IS NOT NULL \
       AND price_offered_expires_at < datetime('now');\""
```

Все строки должны быть `price_offered` (dry-run их не тронул).

### 3. Боевой прогон вручную

Один раз запускаем реально — убеждаемся, что просроченные становятся
`cancelled`, живые (не-просроченные) не задеты.

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 \
  'sudo /usr/local/bin/kamizo-marketplace-expire-offers.sh'
```

### 4. Устанавливаем unit + timer, включаем

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
sudo install -m 644 /tmp/kamizo-marketplace-expire-offers.service /etc/systemd/system/
sudo install -m 644 /tmp/kamizo-marketplace-expire-offers.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kamizo-marketplace-expire-offers.timer
systemctl list-timers kamizo-marketplace-expire-offers.timer --no-pager
EOF
```

Хвост `list-timers` должен показать «NEXT в течение 15 мин».

## Диагностика

```bash
# Свежие прогоны
sudo journalctl -u kamizo-marketplace-expire-offers.service -n 40 --no-pager

# Ручной запуск (без ожидания следующего слота)
sudo systemctl start kamizo-marketplace-expire-offers.service

# Отключение (аварийно)
sudo systemctl disable --now kamizo-marketplace-expire-offers.timer
```

## Обновление скрипта

При правке `deploy/systemd/kamizo-marketplace-expire-offers.sh` в
репо: снова scp и `install -m 755 … /usr/local/bin/`. Юниты
трогать не надо. Перед боевым overwrite'ом — DRY_RUN=1, всегда.
