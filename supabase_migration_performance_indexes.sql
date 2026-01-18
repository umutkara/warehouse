-- ============================================
-- WMS Performance: Add missing indexes for warehouse map queries
-- ============================================
-- This migration adds indexes to optimize queries in /api/cells/units and /api/cells/removed-units

-- 0. Add missing columns to unit_moves if they don't exist
-- ============================================
-- Check if source column exists, add if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unit_moves' 
    AND column_name = 'source'
  ) THEN
    ALTER TABLE public.unit_moves ADD COLUMN source text;
  END IF;
END $$;

-- Check if moved_by column exists, add if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unit_moves' 
    AND column_name = 'moved_by'
  ) THEN
    ALTER TABLE public.unit_moves ADD COLUMN moved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Check if note column exists, add if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'unit_moves' 
    AND column_name = 'note'
  ) THEN
    ALTER TABLE public.unit_moves ADD COLUMN note text;
  END IF;
END $$;

-- 1. Add composite index for units table (warehouse_id + cell_id)
-- ============================================
-- This optimizes: SELECT * FROM units WHERE warehouse_id = ? AND cell_id = ?
CREATE INDEX IF NOT EXISTS idx_units_warehouse_id_cell_id 
ON public.units(warehouse_id, cell_id);

-- Also add separate index on cell_id for other queries
CREATE INDEX IF NOT EXISTS idx_units_cell_id 
ON public.units(cell_id) 
WHERE cell_id IS NOT NULL;

-- 2. Add indexes for unit_moves table
-- ============================================
-- These optimize queries for removed units during inventory:
-- SELECT * FROM unit_moves WHERE from_cell_id = ? AND to_cell_id IS NULL AND source = 'inventory' AND warehouse_id = ?

-- Index on from_cell_id (for filtering by source cell)
CREATE INDEX IF NOT EXISTS idx_unit_moves_from_cell_id 
ON public.unit_moves(from_cell_id) 
WHERE from_cell_id IS NOT NULL;

-- Index on to_cell_id (for filtering NULL values)
CREATE INDEX IF NOT EXISTS idx_unit_moves_to_cell_id 
ON public.unit_moves(to_cell_id) 
WHERE to_cell_id IS NULL;

-- Composite index for the most common query pattern (removed units)
-- This covers: from_cell_id, to_cell_id IS NULL, source, warehouse_id
CREATE INDEX IF NOT EXISTS idx_unit_moves_removed_inventory 
ON public.unit_moves(warehouse_id, from_cell_id, source) 
WHERE to_cell_id IS NULL AND source = 'inventory';

-- Also add index on source for other queries
CREATE INDEX IF NOT EXISTS idx_unit_moves_source 
ON public.unit_moves(source) 
WHERE source IS NOT NULL;

-- 3. Add index on units.cell_id for NULL checks
-- ============================================
-- This helps filter units that are not in any cell (cell_id = NULL)
CREATE INDEX IF NOT EXISTS idx_units_cell_id_null 
ON public.units(warehouse_id, cell_id) 
WHERE cell_id IS NULL;

-- 4. Analyze tables to update statistics
-- ============================================
ANALYZE public.units;
ANALYZE public.unit_moves;

-- Comments for documentation
COMMENT ON INDEX idx_units_warehouse_id_cell_id IS 'Optimizes queries for units in a specific cell within a warehouse';
COMMENT ON INDEX idx_unit_moves_removed_inventory IS 'Optimizes queries for units removed from cells during inventory (to_cell_id IS NULL, source = inventory)';
