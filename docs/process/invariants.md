# Process Invariants

These invariants are mandatory for the critical warehouse process. Any code change that affects them must update tests and process docs in the same PR.

## P0 Invariants (must always hold)

1. **INV-01 (Auth):** Unauthorized user cannot move or ship units.
2. **INV-02 (Warehouse boundary):** Unit and target cell must belong to actor warehouse.
3. **INV-03 (Inventory lock):** Moves are blocked when inventory mode is active.
4. **INV-04 (Cell validity):** Inactive or blocked target cell cannot receive a unit.
5. **INV-05 (Move audit):** Successful move creates a movement record.
6. **INV-06 (Ship out transition):** Successful ship-out moves unit to `out`.
7. **INV-07 (Task completion):** Ship-out completes related `picking_tasks` that are `open`/`in_progress`.
8. **INV-08 (Ops meta update):** Ship-out sets `units.meta.ops_status` to `in_progress`.
9. **INV-09 (Transfer dedupe):** Transfer creation must not create duplicate `in_transit` records for the same unit.
10. **INV-10 (Error contract):** Validation and permission failures return stable HTTP status codes.
11. **INV-11 (Task lifecycle):** Picking task transitions are constrained to `open -> in_progress -> done/canceled`.
12. **INV-12 (Cancel rollback):** Task cancel returns units to snapshot source cells and marks task as `canceled`.

## Required test mapping

- `INV-01..INV-05` -> `/api/units/move` contract tests.
- `INV-01, INV-06..INV-10` -> `/api/logistics/ship-out` contract tests.
- `INV-11..INV-12` -> `/api/picking-tasks/[id]/cancel` contract tests.
- Return flow invariants -> return/move integration tests.
