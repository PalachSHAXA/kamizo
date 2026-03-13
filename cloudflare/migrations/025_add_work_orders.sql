-- Work Orders table for planned/preventive/emergency/seasonal work
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('planned', 'preventive', 'emergency', 'seasonal')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  building_id TEXT,
  apartment_id TEXT,
  assigned_to TEXT,
  scheduled_date TEXT,
  scheduled_time TEXT,
  started_at TEXT,
  completed_at TEXT,
  estimated_duration INTEGER DEFAULT 60,
  actual_duration INTEGER,
  materials TEXT,
  checklist TEXT,
  notes TEXT,
  request_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (building_id) REFERENCES buildings(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (request_id) REFERENCES requests(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant_id ON work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_type ON work_orders(type);
CREATE INDEX IF NOT EXISTS idx_work_orders_building_id ON work_orders(building_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_scheduled_date ON work_orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_request_id ON work_orders(request_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_created_by ON work_orders(created_by);
