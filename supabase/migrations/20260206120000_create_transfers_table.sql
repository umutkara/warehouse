-- Create transfers table for inter-warehouse buffer
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  status text NOT NULL DEFAULT 'in_transit',
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  meta jsonb
);

ALTER TABLE transfers
  ADD CONSTRAINT transfers_status_check
  CHECK (status IN ('in_transit', 'received', 'cancelled'));

CREATE INDEX IF NOT EXISTS transfers_to_status_idx
  ON transfers (to_warehouse_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS transfers_from_status_idx
  ON transfers (from_warehouse_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS transfers_unit_in_transit_idx
  ON transfers (unit_id)
  WHERE status = 'in_transit';
