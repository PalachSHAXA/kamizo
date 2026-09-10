-- 086 — Связь finance_estimates с meetings (PR-8 блок H).
--
-- Расширяем существующую ось approval (миграция 065: approval_status +
-- approved_by + approved_at) юридически-значимой привязкой к общему
-- собранию собственников. Compliance-audit раздел 3.14: смета должна быть
-- приложением к протоколу ОС.
--
-- НИЧЕГО не удаляем и не переименовываем. Все 6 новых колонок nullable —
-- baseline-сметы без утверждения ОС остаются валидными. approval_status
-- CHECK не трогаем (SQLite не поддерживает ALTER CHECK без пересборки
-- таблицы, и текущие 4 значения 'draft/pending/approved/rejected' покрывают
-- всё нужное).
--
-- Новые поля:
--
-- 1. approval_meeting_id        TEXT — id собрания, утвердившего смету.
--                                Логический FK на meetings(id). Физический
--                                FK не ставим (SQLite ALTER TABLE ADD COLUMN
--                                не поддерживает REFERENCES).
-- 2. approval_protocol_number   TEXT — номер протокола ("№4" и т.п.).
-- 3. approval_agenda_item_id    TEXT — id пункта повестки, на котором
--                                смету утвердили. Логический FK на
--                                meeting_agenda_items(id).
-- 4. approval_vote_result       TEXT — свободный текст итогов голосования,
--                                напр. "85% за, 10% против, 5% воздержались".
--                                Хранится как строка, потому что формат
--                                отчёта варьируется от УК к УК.
-- 5. approval_signed_at         TEXT — дата подписания протокола (ISO).
--                                Отличается от approved_at (миграция 065:
--                                момент нажатия кнопки в системе) — signed_at
--                                = юридический факт подписания протокола.
-- 6. approval_notes             TEXT — дополнительные заметки к утверждению
--                                (напр. условия/оговорки). Опционально.
--
-- Активация сметы (POST /activate) НЕ ТРОГАЕТСЯ — она по-прежнему выставляет
-- status='active', approval_status='approved', approved_by/at. Эта миграция
-- лишь добавляет опциональные юридические реквизиты, которые проставляются
-- отдельным endpoint'ом POST /:id/approval-details после активации
-- (например, когда прошло ОС и появился протокол).
--
-- PDF-инвариант: renderApprovalFooterHtml() возвращает '' если
-- approval_status != 'approved' ИЛИ все approval_meeting_* пусты. Baseline
-- myhelper 2026-08 (estimate 63) — status='draft' → SHA256
-- 0bb1d311d0155e9c5cf47d1be5cbcc5bf497ed9bcef5c56961933807551e781c
-- сохраняется без изменений.

ALTER TABLE finance_estimates ADD COLUMN approval_meeting_id       TEXT;
ALTER TABLE finance_estimates ADD COLUMN approval_protocol_number  TEXT;
ALTER TABLE finance_estimates ADD COLUMN approval_agenda_item_id   TEXT;
ALTER TABLE finance_estimates ADD COLUMN approval_vote_result      TEXT;
ALTER TABLE finance_estimates ADD COLUMN approval_signed_at        TEXT;
ALTER TABLE finance_estimates ADD COLUMN approval_notes            TEXT;

CREATE INDEX IF NOT EXISTS idx_finance_estimates_approval_meeting
  ON finance_estimates(approval_meeting_id);
