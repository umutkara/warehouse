-- One-time backfill: for units with status = 'rejected' but cell_id wrong (null or not rejected),
-- set cell_id from the latest unit_moves row where they were moved TO a rejected cell.
-- Safe: only touches units that are status=rejected and currently have wrong cell_id.
-- Run after 20260202120000_fix_move_unit_to_cell_always_update_cell_id.sql

UPDATE units u
SET cell_id = sub.to_cell_id
FROM (
  SELECT DISTINCT ON (um.unit_id)
    um.unit_id,
    um.to_cell_id
  FROM unit_moves um
  JOIN warehouse_cells_map w ON w.id = um.to_cell_id AND w.cell_type = 'rejected'
  WHERE um.to_cell_id IS NOT NULL
  ORDER BY um.unit_id, um.created_at DESC NULLS LAST
) sub
WHERE u.id = sub.unit_id
  AND u.status = 'rejected'
  AND (
    u.cell_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM warehouse_cells_map w2
      WHERE w2.id = u.cell_id AND w2.cell_type = 'rejected'
    )
  );
