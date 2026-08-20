-- Согласование сметы: «на рассмотрении» → «утверждена» / «возвращена на доработку».
--
-- Почему отдельная колонка, а не новое значение в status:
-- status уже занят жизненным циклом сметы ('draft','active','archived'), а его
-- CHECK в SQLite расширяется только пересборкой таблицы. finance_estimates за
-- миграции 036/057/059/060/061/063 обросла ~40 колонками, и пересборка на проде
-- (CREATE new + COPY + DROP + RENAME) слишком рискованна: под ней finance_charges,
-- finance_expenses и v2-таблицы, а status='active' читается из шести мест.
-- Тот же приём уже применён в 057 §1 для apartments.property_type.
--
-- Инварианты (держатся в cloudflare/src/routes/finance.ts):
--   status='draft'  + approval_status='draft'    → черновик, редактируется
--   status='draft'  + approval_status='pending'  → на рассмотрении, правки закрыты
--   status='draft'  + approval_status='rejected' → возвращена, снова редактируется
--   status='active' + approval_status='approved' → утверждена и действует
--   status='archived'                            → архив (approval_status не смотрим)

ALTER TABLE finance_estimates ADD COLUMN approval_status TEXT DEFAULT 'draft'
  CHECK (approval_status IN ('draft','pending','approved','rejected'));

ALTER TABLE finance_estimates ADD COLUMN submitted_by     TEXT;
ALTER TABLE finance_estimates ADD COLUMN submitted_at     TEXT;
ALTER TABLE finance_estimates ADD COLUMN approved_by      TEXT;
ALTER TABLE finance_estimates ADD COLUMN approved_at      TEXT;
ALTER TABLE finance_estimates ADD COLUMN rejected_by      TEXT;
ALTER TABLE finance_estimates ADD COLUMN rejected_at      TEXT;
ALTER TABLE finance_estimates ADD COLUMN rejection_reason TEXT;

-- Уже действующие сметы задним числом считаем утверждёнными: до этой миграции
-- активация и была утверждением.
UPDATE finance_estimates
SET approval_status = 'approved',
    approved_at     = COALESCE(approved_at, created_at)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_finance_estimates_approval
  ON finance_estimates(tenant_id, approval_status);
