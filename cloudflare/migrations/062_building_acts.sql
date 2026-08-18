-- Раздел «Протоколы»: акты приёма-передачи дома в управление (ЗРУ-581).
-- Храним ПАРАМЕТРЫ акта (не бинарь) — PDF/DOCX перегенерируются из записи.
-- Мультитенантность: tenant_id обязателен, все выборки фильтруются по нему.
CREATE TABLE IF NOT EXISTS building_acts (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  tenant_id TEXT DEFAULT '',
  act_type TEXT DEFAULT 'handover',        -- расширяемо: handover / inspection / ...
  act_number TEXT,
  act_date TEXT,
  basis_json TEXT,                          -- {meeting_decision_no,date, contract_no,date}
  options_json TEXT,                        -- {has_parking,has_nonresidential,tech_docs[],keys,funds_amount,free_text}
  snapshot_json TEXT,                       -- факты дома + кол-во ячеек по типам на момент акта
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_building_acts_building ON building_acts(building_id, tenant_id);
