#!/usr/bin/env bash
# .claude/hooks/pre-bash-guard.sh
#
# PreToolUse hook для Bash — блокирует НЕОБРАТИМЫЕ команды ДО выполнения.
#
# Контракт с Claude Code:
#   stdin  = JSON  { "tool_name": "Bash",
#                    "tool_input": { "command": "...", "description": "..." },
#                    ... }
#   exit 0 = разрешить
#   exit 2 = заблокировать, stderr показывается Claude'у как причина
#
# ═══════════════════════════════════════════════════════════════════════
# ⚠️  FAIL-OPEN — критично к пониманию перед правкой этого скрипта:
#
# Если этот скрипт падает (unhandled error, отсутствующая утилита, invalid
# regex, out of memory), Claude Code трактует hook как «не сработал» и
# РАЗРЕШАЕТ команду. То есть любая внутренняя поломка тут = молчаливая
# дыра в защите, о которой пользователь не узнает пока не разберёт логи.
#
# Отсюда правила:
#   1. НЕ использовать `set -e`. Любой шаг обязан обрабатывать свою
#      ошибку сам, без пропагации.
#   2. Все внешние утилиты (python3, grep, tr, printf) — проверяются на
#      доступность; при отсутствии — деградируем на fallback, не падаем.
#   3. Парсинг ввода — best-effort. Если не смогли распарсить, выводим
#      warning в stderr (чтобы факт «hook не проверил» был виден в логах)
#      и exit 0. Лучше пропустить проверку с warning'ом, чем упасть и
#      незаметно отключить защиту.
#   4. Все `grep`/`sed`/`tr` в основных проверках заворачиваются в
#      `|| true` или помещаются в `if`-условия, где ненулевой exit не
#      роняет скрипт.
# ═══════════════════════════════════════════════════════════════════════
#
# ЧЕСТНОЕ ОГРАНИЧЕНИЕ по покрытию:
# Матчинг — регекс по сырой команде. Это защита ОТ СЛУЧАЙНОСТИ, не броня.
# Что скрипт НЕ поймает:
#   - `bash -c "$VAR"` где $VAR раскрывается в опасное
#   - base64/eval-обёртки
#   - вложенные кавычки: `ssh vps "bash -c 'rm -rf /opt/kamizo'"`
#     — внешние двойные кавычки могут запутать простой regex
# SSH-ветку ловим только простые случаи `ssh <target> '<inline-cmd>'` — этого
# достаточно, чтобы поймать наш основной паттерн ручных прод-изменений
# (именно так набежал schema drift).
# Настоящий периметр = permissions.allow[] + человеческое подтверждение
# перед прод-действиями.

# ─── set flags ────────────────────────────────────────────────────────
# -u: сигналить о неинициализированных переменных (typo-safety)
# -o pipefail: exit status пайпа = крайний ненулевой (нужно для наших `|| true`)
# -e НАМЕРЕННО НЕ включаем (см. FAIL-OPEN выше)
set -uo pipefail

# ─── 0. Прочитать вход, извлечь команду с fallback'ами ───────────────

INPUT=""
INPUT=$(cat 2>/dev/null) || INPUT=""

# Warning helper — виден в claude-code hook logs.
warn() {
    printf 'pre-bash-guard: WARNING — %s (allowing, fail-open)\n' "$1" >&2
}

CMD=""

# Prefer python3 (устойчивый парсер JSON). Не крашимся если его нет.
if command -v python3 >/dev/null 2>&1; then
    CMD=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""), end="")
except Exception:
    print("", end="")
' 2>/dev/null) || CMD=""
fi

# Fallback: если python3 недоступен ИЛИ ничего не извлекли — grep из JSON.
# Наивный, обрывается на первой " внутри значения, но для «дежурной проверки»
# работает и не крашится.
if [ -z "$CMD" ]; then
    CMD=$(printf '%s' "$INPUT" \
        | grep -oE '"command"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' \
        | head -1 \
        | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"//; s/"$//' \
        2>/dev/null) || CMD=""
fi

# Если так и не получили команду — не падаем, но выводим warning.
if [ -z "$CMD" ]; then
    warn "could not parse command from hook stdin"
    exit 0
fi

# Нормализация — свернуть переводы строк в пробелы, схлопнуть повторы.
# Это нужно, чтобы многострочный heredoc или && цепочка ловились одним regex.
CMD_NORM=""
CMD_NORM=$(printf '%s' "$CMD" | tr '\n\r' '  ' 2>/dev/null | tr -s ' ' 2>/dev/null) || CMD_NORM="$CMD"

# ─── block helper ─────────────────────────────────────────────────────
# Печатает причину в stderr, выходит с кодом 2 → Claude Code блокирует
# вызов и показывает Claude'у причину.
block() {
    printf 'BLOCKED by pre-bash-guard:\n\n%s\n\nЕсли это действие ТОЧНО осознанно и последствия понятны — попроси пользователя запустить команду вручную. Не пытайся обойти этот hook.\n' "$1" >&2
    exit 2
}

# safe_match: grep -qE с автоматическим || true, чтобы не активировать
# pipefail при отсутствии совпадения. Возвращает 0 если совпало, 1 если нет.
safe_match() {
    local pattern="$1"
    printf '%s' "$CMD_NORM" | grep -qE "$pattern" 2>/dev/null
    return $?
}

safe_match_i() {
    local pattern="$1"
    printf '%s' "$CMD_NORM" | grep -qEi "$pattern" 2>/dev/null
    return $?
}

# ═══════════════════════════════════════════════════════════════════════
# ПРОВЕРКИ. Каждая ЯВНО обрабатывает свой exit code через safe_match.
# ═══════════════════════════════════════════════════════════════════════

# ─── 1. git push --force / -f / --force-with-lease ───────────────────
if safe_match '(^|[[:space:]&|;])git[[:space:]]+push([[:space:]]+[^;|&]*)?[[:space:]](--force([[:space:]]|$)|-f([[:space:]]|$)|--force-with-lease)'; then
    block "git push --force / -f / --force-with-lease.
Перезаписывает историю и может стереть чужие коммиты.
CLAUDE.md: 'Force-push в main НИКОГДА без явного запроса'."
fi

# ─── 2. git reset --hard ─────────────────────────────────────────────
if safe_match '(^|[[:space:]&|;])git[[:space:]]+reset[[:space:]]+([^|&;]*[[:space:]])?--hard'; then
    block "git reset --hard.
Уничтожает все незакоммиченные изменения в рабочем дереве.
Если рабочее дерево грязное — это потеря работы без возможности отката."
fi

# ─── 3. rsync --delete ───────────────────────────────────────────────
if safe_match '(^|[[:space:]&|;])rsync[[:space:]].*(--delete[[:space:]]|--delete$|--delete-after|--delete-before|--delete-during|--delete-excluded)'; then
    block "rsync --delete.
CLAUDE.md явно запрещает: на проде /opt/kamizo/app/server-src/ есть файлы
вне репозитория (ручные таблицы, snapshots, orphan artefacts) — --delete
их снесёт. Синхронизируй без --delete."
fi

# ─── 4. wrangler d1 execute --remote ─────────────────────────────────
if safe_match '(^|[[:space:]&|;])wrangler[[:space:]]+d1[[:space:]]+execute[[:space:]].*--remote'; then
    block "wrangler d1 execute --remote.
Может дропнуть таблицы в прод-D1 (архив, но живой). Kamizo prod-DB на VPS
SQLite, не D1 — этот путь скорее всего ошибка. См. skill
kamizo-schema-drift-guard: миграции применяются через sqlite3 < file.sql
на VPS."
fi

# ─── 5. Прямой деструктивный SQL на прод kamizo.db (локально) ────────
if safe_match_i 'kamizo\.db[^"]*(ALTER[[:space:]]+TABLE|DROP[[:space:]]+TABLE|TRUNCATE|DELETE[[:space:]]+FROM)'; then
    block "destructive SQL against prod kamizo.db (ALTER TABLE / DROP TABLE / TRUNCATE / DELETE FROM).
Ручные изменения схемы на VPS — источник ВСЕГО текущего schema drift
(5 таблиц найдено за 2026-07-09). Правильный путь: файл миграции
cloudflare/migrations/NNN_*.sql, применяется через sqlite3 < file.sql.
См. skill kamizo-schema-drift-guard."
fi

# ─── 6. DROP TABLE в любом контексте ─────────────────────────────────
if safe_match_i 'DROP[[:space:]]+TABLE([[:space:]]+IF[[:space:]]+EXISTS)?[[:space:]]+[a-zA-Z_"`]'; then
    block "DROP TABLE.
Необратимо. Даже с IF EXISTS. Если это осознанная миграция — файл в
cloudflare/migrations/ и пользователь применяет вручную."
fi

# ─── 7. DELETE FROM без WHERE ────────────────────────────────────────
if safe_match_i 'DELETE[[:space:]]+FROM[[:space:]]+[a-zA-Z_"`]'; then
    if ! safe_match_i 'DELETE[[:space:]]+FROM[[:space:]]+[^;]*[[:space:]]+WHERE[[:space:]]'; then
        block "DELETE FROM без WHERE.
Удаляет ВСЮ таблицу целиком. Если это правда цель — сформулируй как явную
миграцию, применяемую пользователем."
    fi
fi

# ─── 8. rm на чувствительные пути (локально) ─────────────────────────
if safe_match '(^|[[:space:]&|;])rm[[:space:]].*(/opt/kamizo(/|[[:space:]]|$)|/opt/kamizo/data|~/\.ssh|\$HOME/\.ssh|~/\.claude/skills|~/\.claude/settings|/etc/(passwd|shadow|nginx|systemd))'; then
    block "rm targeting sensitive path (kamizo prod / .ssh / .claude / etc).
Пути ~/.ssh/kamizo_vps, /opt/kamizo/data/kamizo.db, .claude/skills/
критичны для восстановления доступа/состояния. Пользователь запускает
руками, если это точно осознанная чистка."
fi

# ─── 9. rm -rf / — катастрофа ────────────────────────────────────────
if safe_match '(^|[[:space:]&|;])rm[[:space:]]+(-[rRfv]+[[:space:]]+)?/[[:space:]]*($|;|&&|\|\|)'; then
    block "rm -rf /.
Катастрофа. Даже проверять не буду, что ты имел в виду."
fi

# ═══════════════════════════════════════════════════════════════════════
# SSH-NESTED — деструктив внутри ssh '...' на прод-VPS
# ═══════════════════════════════════════════════════════════════════════
# Наш основной путь к проду: ssh -i ~/.ssh/kamizo_vps kamizo@95.46.96.209 '...'
# Именно этот канал породил весь текущий schema drift (ручные ALTER TABLE
# прямо на VPS-базе). Ловим типичные простые случаи.
#
# ЧЕСТНО о покрытии этих SSH-паттернов:
#   ✓ ловим:  ssh <host> 'rm -rf ...'                            (одиночные)
#   ✓ ловим:  ssh <host> 'sqlite3 ... ALTER/DROP/DELETE ...'
#   ✓ ловим:  ssh <host> 'systemctl stop/disable ...'
#   ✗ НЕ ловим: ssh <host> "bash -c 'rm -rf ...'"                 (вложенные "")
#   ✗ НЕ ловим: ssh <host> "$MULTILINE_VAR"                        (переменная)
#   ✗ НЕ ловим: ssh <host> < script.sh                             (redirect)
# Это защита от «привычки» ходить в прод одним `ssh ... '...'` — но НЕ от
# осознанного обхода. Если что-то сложное на прод — пусть пользователь
# запускает вручную и подтверждает.

# ─── 10. ssh + rm -rf в remote-части ─────────────────────────────────
# Матчит: ssh ...<anything>... rm ...-r/-f/-rf/-fr... <path>
# Отдельно ловим удалы прод-путей и корней.
if safe_match '(^|[[:space:]&|;])ssh[[:space:]].*rm[[:space:]]+(-[rRfv]+[[:space:]]+)?(/opt/kamizo|/opt/kamizo/data|/etc/|/var/log|\*)'; then
    block "ssh <vps> 'rm ... on sensitive prod path'.
Это наш основной канал прод-доступа — ручные удаления на VPS необратимы.
Если чистка точно осознана — пользователь заходит в ssh руками и запускает."
fi

# Общий rm -rf на любой абсолютный путь через ssh — тоже подозрительно.
if safe_match '(^|[[:space:]&|;])ssh[[:space:]].*rm[[:space:]]+-[rRfv]+[[:space:]]+/'; then
    block "ssh <vps> 'rm -rf /...'.
Удаление по абсолютному пути на удалённой машине через ssh — риск слишком
высок для автоматики. Пользователь запускает вручную."
fi

# ─── 11. ssh + деструктивный sqlite3 на kamizo.db ────────────────────
# Матчит: ssh ... sqlite3 ... kamizo.db ... (ALTER|DROP|DELETE|TRUNCATE)
# Ловит именно тот паттерн, что породил schema drift.
if safe_match_i '(^|[[:space:]&|;])ssh[[:space:]].*sqlite3[[:space:]].*kamizo\.db[^"]*(ALTER[[:space:]]+TABLE|DROP[[:space:]]+TABLE|TRUNCATE|DELETE[[:space:]]+FROM)'; then
    block "ssh <vps> 'sqlite3 kamizo.db \"ALTER/DROP/DELETE/TRUNCATE ...\"'.
Именно так набежал текущий schema drift — ручные ALTER TABLE на проде без
файла миграции. Правильный путь: файл cloudflare/migrations/NNN_*.sql +
scp + sqlite3 < file.sql на VPS. См. kamizo-schema-drift-guard."
fi

# ─── 12. ssh + systemctl stop/disable ────────────────────────────────
# Останавливает kamizo-api или другие критичные сервисы. Reboot/restart
# разрешён (rolling restart нормальная операция), но stop без последующего
# start и disable — это отключение сервиса.
if safe_match '(^|[[:space:]&|;])ssh[[:space:]].*systemctl[[:space:]]+(stop|disable|mask)[[:space:]]+(kamizo-api|nginx|sshd|postgresql|mysql)'; then
    block "ssh <vps> 'systemctl stop/disable/mask <critical-service>'.
Останавливает прод-сервис. Если это плановый maintenance — пользователь
запускает вручную с явным пониманием, что API станет недоступным."
fi

# ─── ALLOW ────────────────────────────────────────────────────────────
exit 0
