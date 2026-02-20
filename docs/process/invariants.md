# Process Invariants

These invariants are mandatory for the critical warehouse process. Any code change that affects them must update tests and process docs in the same PR.

## P0 Invariants (must always hold)

1. **INV-01 (Auth):** Unauthorized user is rejected on move, ship-out, and cancel endpoints.
2. **INV-02 (Role gates):** Ship-out is allowed only for `logistics/admin/head/hub_worker`; cancel is allowed only for `ops/admin`.
3. **INV-03 (Move input contract):** `/api/units/move` validates required fields and `toStatus` enum.
4. **INV-04 (Inventory lock mapping):** Inventory lock (`INVENTORY_ACTIVE`) is mapped to HTTP `423` on move flow.
5. **INV-05 (Move RPC delegation):** `/api/units/move` delegates movement to `move_unit_to_cell` with `p_source=move` and returns normalized success payload.
6. **INV-06 (Move error mapping):** Domain errors from move flow are mapped to stable status codes (`404/403/400`).
7. **INV-07 (Ship-out success contract):** Successful ship-out returns `{ ok: true, shipment }`.
8. **INV-08 (Hub worker fallback):** If primary ship-out RPC returns forbidden for `hub_worker`, endpoint retries via admin RPC.
9. **INV-09 (Ship-out side effects):** Ship-out auto-completes related open/in-progress tasks and sets `units.meta.ops_status` to `in_progress`.
10. **INV-10 (Transfer dedupe and branches):** Ship-out transfer creation is deduplicated by existing `in_transit` record and supports hub/explicit branch creation.
11. **INV-11 (Cancel terminal guard):** Completed/canceled picking tasks cannot be canceled again.
12. **INV-12 (Cancel rollback + tolerance):** Cancel flow marks task as `canceled`, attempts to return all units to snapshot source cells, logs successful returns, and tolerates per-unit move failures.
13. **INV-13 (BIN ingress policy in scan flow):** `/api/units/move-by-scan` forbids moving to `bin` from non-`bin` cells (including `rejected`/`ff`).
14. **INV-14 (Return flow):** Returning unit from `out` to `bin` via `/api/units/move` is supported and normalized.

## Required test mapping

- `INV-01, INV-03..INV-06` -> `tests/api/units-move.contract.test.ts`
- `INV-01, INV-02, INV-07..INV-10` -> `tests/api/ship-out.contract.test.ts`
- `INV-10` branch coverage -> `tests/api/ship-out.transfer.contract.test.ts`
- `INV-01, INV-02, INV-11..INV-12` -> `tests/api/picking-task-cancel.contract.test.ts`
- `INV-13` -> `tests/api/units-move-by-scan.contract.test.ts`
- `INV-14` -> `tests/integration/return-flow.test.ts`
