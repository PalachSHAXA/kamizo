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

## Проверенные SQLite-бэкапы

`kamizo-sqlite-backup.sh` делает online backup WAL-базы через SQLite
`.backup` с `.timeout 30000`, проверяет `integrity_check` и
`foreign_key_check`, после чего публикует generation по commit-marker
протоколу. Artifact и SHA-256 переименовываются первыми, JSON manifest —
последним. Только generation с корректным manifest считается завершённым;
это не трёхфайловая атомарная транзакция. Следующий запуск удаляет orphan
artifact/sidecar точных managed-имён без manifest, а также с warning удаляет
всю тройку точного timestamped managed-имени, если JSON, filename, size или
hash metadata не проходят committed-generation validation. Valid generation
и любые legacy/non-managed шаблоны этот cleanup не затрагивает. Retention
учитывает только завершённые generation: hourly 168 `.db`, daily 35 `.db.gz`;
настройка keep обязана быть не меньше 1. Legacy `.sql.gz` автоматически не
удаляются.

Production-пути фиксированы:

- source: `/opt/kamizo/data/kamizo.db`;
- hourly: `/opt/kamizo/backups/sqlite/hourly/`;
- daily: `/opt/kamizo/backups/sqlite/daily/`;
- общий nonblocking lock backup/restore:
  `/run/lock/kamizo-backup.lock`. Каталог root-owned; файл обязан быть
  regular non-symlink `root:kamizo` mode `0660`. Worker/restore открывают его
  append/no-truncate и сверяют inode открытого fd.

Перед backup должно быть свободно не меньше `2 * размер kamizo.db + 512 MiB`.
Restore по умолчанию ограничен 2 GiB uncompressed и требует дополнительный
reserve 512 MiB. Gzip сначала проверяется по metadata, затем распаковывается
через жёстко ограниченный stream, поэтому ложный/wrapped ISIZE не даёт
неограниченно заполнить диск.

### Установка и миграция ownership

Сначала убедиться, что на VPS доступны `sqlite3`, `flock`, `runuser`, `gzip`,
`sha256sum`, `stat`, `sync`, `df`, `awk` и `dd`. Worker и apply требуют
настоящий `flock` в production.

```bash
scp -i ~/.ssh/kamizo_vps \
  deploy/systemd/kamizo-sqlite-backup.sh \
  deploy/systemd/kamizo-backup-hourly.service \
  deploy/systemd/kamizo-backup-hourly.timer \
  deploy/systemd/kamizo-backup-daily.service \
  deploy/systemd/kamizo-backup-daily.timer \
  scripts/restore.sh \
  kamizo@95.46.96.209:/tmp/

ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -e
sudo systemctl stop kamizo-backup-hourly.timer kamizo-backup-daily.timer
sudo install -d -o root -g root -m 755 /run/lock
sudo touch /run/lock/kamizo-backup.lock
sudo chown root:kamizo /run/lock/kamizo-backup.lock
sudo chmod 0660 /run/lock/kamizo-backup.lock
printf '%s\n' 'f /run/lock/kamizo-backup.lock 0660 root kamizo -' | \
  sudo tee /etc/tmpfiles.d/kamizo-backup.conf >/dev/null
sudo systemd-tmpfiles --create /etc/tmpfiles.d/kamizo-backup.conf
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite/hourly
sudo install -d -o kamizo -g kamizo -m 700 /opt/kamizo/backups/sqlite/daily
sudo install -o root -g root -m 755 /tmp/kamizo-sqlite-backup.sh /usr/local/bin/
sudo install -o root -g root -m 755 /tmp/restore.sh /usr/local/sbin/kamizo-restore
sudo install -o root -g root -m 644 /tmp/kamizo-backup-hourly.service /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-hourly.timer /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-daily.service /etc/systemd/system/
sudo install -o root -g root -m 644 /tmp/kamizo-backup-daily.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl reset-failed kamizo-backup-hourly.service kamizo-backup-daily.service
EOF
```

`/run` очищается при reboot, поэтому `tmpfiles.d` строка обязательна. До
enable timers проверить `stat -c '%F %U:%G %a' /run/lock/kamizo-backup.lock`:
ожидается `regular empty file root:kamizo 660`. Symlink или иной owner/mode
блокирует unit через Condition/script validation.

Это заменяет содержимое существующих unit-файлов с теми же именами. Старые
root-owned scripts и legacy backup-каталоги не удалять до отдельной ручной
инвентаризации. Новые каталоги должны принадлежать `kamizo:kamizo`; сама БД
остаётся `kamizo:kamizo` с mode `600`. Services запускаются как
`kamizo:kamizo`, имеют `UMask=0077`, `TimeoutStartSec=15min` и не более трёх
retry с `Restart=on-failure`/`RestartSec=2min` в 30-минутном окне.

### Обязательный ручной тест до timer enable

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
set -e
sudo -u kamizo /usr/local/bin/kamizo-sqlite-backup.sh hourly
sudo -u kamizo /usr/local/bin/kamizo-sqlite-backup.sh daily
latest=$(find /opt/kamizo/backups/sqlite/hourly -maxdepth 1 -name 'kamizo-hourly-*.db' -print | sort | tail -n 1)
test -n "$latest"
test -s "$latest.sha256"
test -s "$latest.json"
sudo /usr/local/sbin/kamizo-restore --drill "$latest"
EOF
```

Только после успешного ручного hourly, daily и drill включить timers:

```bash
ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 <<'EOF'
sudo systemctl enable --now kamizo-backup-hourly.timer kamizo-backup-daily.timer
systemctl list-timers 'kamizo-backup-*' --all --no-pager
systemctl show kamizo-backup-daily.timer -p NextElapseUSecRealtime
EOF
```

Daily должен планироваться на 03:30 `Asia/Tashkent`; оба timer имеют
`Persistent=true`. После первого timer-run снова выполнить drill, а не
проверять только зелёный статус systemd. Lock collision и transient error
дают bounded service retry, но после трёх ошибок требуют диагностики.

### Drill и аварийный restore

Drill ничего не останавливает и не пишет в live DB. Для новых `.db`/`.db.gz`
обязательны оба соседних файла: `.sha256` и `.json`. Restore сначала копирует
все три файла в private mode-700 staging, а затем проверяет staged hash,
manifest `filename`/`bytes`/`sha256`, размер, integrity и foreign keys.
Отсутствующий или изменённый manifest означает незавершённый/невалидный
backup.

```bash
sudo /usr/local/sbin/kamizo-restore --drill /opt/kamizo/backups/sqlite/hourly/kamizo-hourly-YYYYMMDDTHHMMSSZ.db
```

Legacy `.sql.gz` никогда не разрешён для `--apply`, не имеет доверенной
metadata и требует явного opt-in только для drill. Запускать его non-root
пользователем; import идёт через `sqlite3 -safe -bail`, поэтому `.shell` и
другие unsafe dot-команды запрещены:

```bash
sudo -u kamizo /usr/local/sbin/kamizo-restore \
  --drill /path/to/legacy.sql.gz --allow-legacy-unsigned
```

`--apply` перезаписывает production DB. Использовать только во время
подтверждённого инцидента, после успешного drill и проверки свободного места:

```bash
sudo /usr/local/sbin/kamizo-restore \
  --apply /opt/kamizo/backups/sqlite/hourly/kamizo-hourly-YYYYMMDDTHHMMSSZ.db \
  --confirm RESTORE
```

Apply требует root, точный token `RESTORE` и только committed `.db`/`.db.gz`.
Порядок операции:

1. Staged backup полностью проверяется и проходит disk preflight.
2. Запоминаются active/enabled состояния обоих backup timers/services, после
   чего они останавливаются.
3. Emergency worker запускается только как `runuser -u kamizo -- ...`.
4. Restore захватывает общий `flock` и держит его до конца cleanup.
5. API останавливается; live WAL обязан успешно пройти
   `wal_checkpoint(TRUNCATE)`, integrity и FK checks.
6. Старый DB копируется и fsync-ится как `kamizo.db.pre-restore-*`; source
   path всё это время существует.
7. Подготовленный same-filesystem stage одним обычным atomic rename заменяет
   существующий source. `renameat2` exchange не используется и не заявляется.
8. API должен стать `systemctl is-active`, пройти SQLite checks и bounded
   curl retries `/api/health`.

При ошибке после swap trap сразу отключает себя и `set -e`, останавливает API,
копирует preserved old DB в новый temp, atomically заменяет source, повторно
проверяет БД, запускает API и повторяет health retries. Каждая ошибка cleanup
логируется. Если rollback нельзя доказать, команда завершится с явным
`CATASTROPHIC ROLLBACK FAILURE`, API остаётся остановленным, а old copy
остаётся сохранённой. Shared lock освобождается до запуска timers. Повторно
запускаются только ранее active timers; прерванные oneshot backup services не
рестартуют, потому что emergency backup их заменяет. Enabled state не меняется.

### Power-loss recovery

После успешного swap остаётся `kamizo.db.pre-restore-TIMESTAMP`. При неудачном
post-swap health также может остаться `kamizo.db.failed-restore-TIMESTAMP`.
Manifest-last orphan в backup-каталоге будет убран следующим worker run.
После power loss сначала не запускать API и проверить preserved old DB:

```bash
sudo systemctl stop kamizo-api.service kamizo-backup-hourly.timer kamizo-backup-daily.timer
old=/opt/kamizo/data/kamizo.db.pre-restore-YYYYMMDDTHHMMSSZ
test "$(sqlite3 "$old" 'PRAGMA integrity_check;')" = ok
test -z "$(sqlite3 "$old" 'PRAGMA foreign_key_check;')"
stage=$(sudo mktemp /opt/kamizo/data/.kamizo-manual-recovery.XXXXXX)
sudo cp -- "$old" "$stage"
sudo chown kamizo:kamizo "$stage" && sudo chmod 600 "$stage"
sudo sync -f "$stage"
sudo rm -f -- /opt/kamizo/data/kamizo.db-wal /opt/kamizo/data/kamizo.db-shm
sudo mv -f -- "$stage" /opt/kamizo/data/kamizo.db
sudo sync -f /opt/kamizo/data
sudo systemctl start kamizo-api.service
systemctl is-active kamizo-api.service
curl --fail --max-time 5 http://127.0.0.1:3000/api/health
```

Эта ручная процедура использует copy+fsync+rename и не удаляет preserved old.

### Диагностика

```bash
sudo systemctl status kamizo-backup-hourly.timer kamizo-backup-daily.timer --no-pager
sudo journalctl -u kamizo-backup-hourly.service -n 100 --no-pager
sudo journalctl -u kamizo-backup-daily.service -n 100 --no-pager
sudo systemctl show kamizo-backup-hourly.service -p NRestarts -p Result
sudo systemctl start kamizo-backup-hourly.service
sudo -u kamizo flock -n /run/lock/kamizo-backup.lock true
sudo du -sh /opt/kamizo/backups/sqlite/{hourly,daily}
sudo journalctl -u 'kamizo-backup-*.service' --grep 'removing invalid managed generation' --no-pager
```

Lock-команда должна завершиться успешно, когда backup не идёт. При ошибках
проверить ownership каталогов, свободное место, наличие обязательных команд
и journal. Warning `removing invalid managed generation` содержит artifact,
чья точная managed-тройка была удалена до нового backup; повторяющиеся warning
требуют проверки диска и процесса публикации. Artifact без manifest не считать
backup. Не удалять lock во время работающего процесса и не запускать apply
параллельно с ручным worker.

### Off-site gap

Этот пакет создаёт только локальные копии на том же VPS и не защищает от
потери самого хоста. Нужна отдельная encrypted off-site репликация с
регулярным restore drill. По требованиям локализации персональных данных
копия и ключи должны физически оставаться в Узбекистане; зарубежные S3/R2
или другие регионы без отдельного юридического решения не использовать.
