-- ============================================
-- WMS Inventory: Cell counts and units tracking
-- ============================================
-- This migration adds tables for storing inventory scan results per cell
-- Prerequisites: inventory_sessions table must exist

-- 1. Create inventory_cell_counts table
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory_cell_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  cell_id uuid NOT NULL REFERENCES public.warehouse_cells(id) ON DELETE CASCADE,
  scanned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'scanned' CHECK (status IN ('pending', 'scanned', 'confirmed')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (session_id, cell_id)
);

-- Indexes for inventory_cell_counts
CREATE INDEX IF NOT EXISTS idx_inventory_cell_counts_session_id ON public.inventory_cell_counts(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_counts_cell_id ON public.inventory_cell_counts(cell_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_counts_scanned_by ON public.inventory_cell_counts(scanned_by);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_counts_status ON public.inventory_cell_counts(status);

-- 2. Create inventory_cell_units table
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory_cell_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  cell_id uuid NOT NULL REFERENCES public.warehouse_cells(id) ON DELETE CASCADE,
  unit_id uuid NULL REFERENCES public.units(id) ON DELETE SET NULL,
  unit_barcode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, cell_id, unit_barcode)
);

-- Indexes for inventory_cell_units
CREATE INDEX IF NOT EXISTS idx_inventory_cell_units_session_id ON public.inventory_cell_units(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_units_cell_id ON public.inventory_cell_units(cell_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_units_unit_id ON public.inventory_cell_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_inventory_cell_units_unit_barcode ON public.inventory_cell_units(unit_barcode);

-- 3. Enable RLS
-- ============================================
ALTER TABLE public.inventory_cell_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cell_units ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for inventory_cell_counts
-- ============================================

-- SELECT: Users can view counts from their warehouse
CREATE POLICY "Users can view inventory cell counts from their warehouse"
  ON public.inventory_cell_counts FOR SELECT
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
    )
  );

-- INSERT: All authenticated users in their warehouse can insert (including worker)
CREATE POLICY "Authenticated users can insert inventory cell counts in their warehouse"
  ON public.inventory_cell_counts FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND s.status = 'active'
    )
    AND scanned_by = auth.uid()
  );

-- UPDATE: Only admin/head/manager can update
CREATE POLICY "Admin/head/manager can update inventory cell counts"
  ON public.inventory_cell_counts FOR UPDATE
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager')
    )
  );

-- DELETE: Only admin/head/manager can delete
CREATE POLICY "Admin/head/manager can delete inventory cell counts"
  ON public.inventory_cell_counts FOR DELETE
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager')
    )
  );

-- 5. RLS Policies for inventory_cell_units
-- ============================================

-- SELECT: Users can view units from their warehouse
CREATE POLICY "Users can view inventory cell units from their warehouse"
  ON public.inventory_cell_units FOR SELECT
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
    )
  );

-- INSERT: All authenticated users in their warehouse can insert (including worker)
CREATE POLICY "Authenticated users can insert inventory cell units in their warehouse"
  ON public.inventory_cell_units FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND s.status = 'active'
    )
  );

-- UPDATE: Only admin/head/manager can update
CREATE POLICY "Admin/head/manager can update inventory cell units"
  ON public.inventory_cell_units FOR UPDATE
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager')
    )
  );

-- DELETE: Only admin/head/manager can delete
CREATE POLICY "Admin/head/manager can delete inventory cell units"
  ON public.inventory_cell_units FOR DELETE
  USING (
    session_id IN (
      SELECT s.id
      FROM public.inventory_sessions s
      INNER JOIN public.profiles p ON p.warehouse_id = s.warehouse_id
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'head', 'manager')
    )
  );

-- 6. Comments for documentation
-- ============================================
COMMENT ON TABLE public.inventory_cell_counts IS 'Stores inventory scan results for each cell. One row per cell per session.';
COMMENT ON TABLE public.inventory_cell_units IS 'Stores individual units found in cells during inventory scan. Multiple rows per cell per session.';

COMMENT ON COLUMN public.inventory_cell_counts.session_id IS 'References the inventory session this count belongs to';
COMMENT ON COLUMN public.inventory_cell_counts.cell_id IS 'The cell that was scanned';
COMMENT ON COLUMN public.inventory_cell_counts.scanned_by IS 'User who performed the scan';
COMMENT ON COLUMN public.inventory_cell_counts.status IS 'Status: pending (not yet scanned), scanned (counted), confirmed (verified)';
COMMENT ON COLUMN public.inventory_cell_counts.meta IS 'Additional metadata (count, notes, etc.)';

COMMENT ON COLUMN public.inventory_cell_units.session_id IS 'References the inventory session this unit record belongs to';
COMMENT ON COLUMN public.inventory_cell_units.cell_id IS 'The cell where this unit was found';
COMMENT ON COLUMN public.inventory_cell_units.unit_id IS 'Reference to unit if it exists in the system (can be NULL for unknown units)';
COMMENT ON COLUMN public.inventory_cell_units.unit_barcode IS 'Barcode of the unit (always stored as text)';

-- 7. Reload PostgREST schema cache
-- ============================================
-- This ensures PostgREST picks up the new table and columns
NOTIFY pgrst, 'reload schema';
