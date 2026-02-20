# Warehouse Process Contract

This folder defines the source-of-truth process contract for critical warehouse flows.

## Scope (current working process)

- Move unit by direct API (`/api/units/move`)
- Move unit by scan flow (`/api/units/move-by-scan`)
- Ship unit out (`/api/logistics/ship-out`)
- Cancel picking task with rollback (`/api/picking-tasks/[id]/cancel`)
- Return from `out` back to `bin` via move API

## Related Documents

- `docs/process/invariants.md`
- `docs/process/test-matrix.md`
- `docs/process/pr-checklist.md`
- `docs/process/working-agreement.md`
- `docs/process/quality-report.md`

## How to use

- Treat invariants as non-negotiable business rules.
- Update sequence/state diagrams when behavior changes.
- Add or update tests for every changed invariant.

## Sequences

### 1) Move Unit (`/api/units/move`)

```mermaid
sequenceDiagram
  actor Operator
  participant API as API /api/units/move
  participant RPC as RPC move_unit_to_cell
  participant DB as DB units + unit_moves

  Operator->>API: POST { unitId, toCellId, toStatus? }
  API->>API: Validate auth + required fields + toStatus enum
  API->>RPC: move_unit_to_cell(p_source=move)
  RPC->>DB: Validate warehouse/cell/inventory lock
  RPC->>DB: Update unit location/status + write movement
  RPC-->>API: { ok, unitId, fromCellId, toCellId, toStatus } or error
  API-->>Operator: 200 on success, mapped 4xx/5xx on error
```

### 2) Move by Scan (`/api/units/move-by-scan`)

```mermaid
sequenceDiagram
  actor Scanner
  participant API as API /api/units/move-by-scan
  participant DB as DB units + warehouse_cells_map
  participant RPC as RPC move_unit_to_cell

  Scanner->>API: POST { unitBarcode, fromCellCode, toCellCode }
  API->>API: Validate auth + normalize inputs
  API->>DB: Load unit and FROM/TO cells by warehouse
  API->>API: Validate active/not blocked + unit in FROM
  API->>API: Enforce allowed moves (no non-bin -> bin)
  API->>RPC: move_unit_to_cell(p_source=move-by-scan, toStatus from cell_type)
  RPC-->>API: { ok, ... } or error
  API-->>Scanner: 200 with normalized payload or 4xx/5xx
```

### 3) Ship Out (`/api/logistics/ship-out`)

```mermaid
sequenceDiagram
  actor Logistic
  participant API as API /api/logistics/ship-out
  participant RPC as RPC ship_unit_out
  participant Admin as Admin RPC fallback
  participant DB as DB picking_tasks + units + transfers
  participant Audit as audit_log_event

  Logistic->>API: POST { unitId, courierName, transferToWarehouseId? }
  API->>API: Validate auth + role + warehouse + payload
  API->>DB: Resolve scenario/target cell (new + legacy task links)
  API->>RPC: ship_unit_out(...)
  alt hub_worker forbidden on primary RPC
    API->>Admin: ship_unit_out(...) via supabaseAdmin
    Admin-->>API: fallback result
  end
  API->>DB: Auto-complete related open/in_progress picking tasks
  API->>DB: Set units.meta.ops_status=in_progress (+ comment)
  API->>DB: Create transfer (hub/explicit branch) with dedupe
  API->>Audit: picking_task_complete + ops.unit_status_update + logistics.ship_out
  API-->>Logistic: { ok: true, shipment }
```

### 4) Cancel Picking Task (`/api/picking-tasks/[id]/cancel`)

```mermaid
sequenceDiagram
  actor OPS as OPS/Admin
  participant API as API /api/picking-tasks/[id]/cancel
  participant DB as DB picking_tasks + picking_task_units + units + unit_moves
  participant Audit as audit_log_event

  OPS->>API: POST cancel task
  API->>API: Validate auth + role
  API->>DB: Load task (admin can cross-warehouse)
  API->>API: Reject if status is done/canceled
  API->>DB: Load task units with from_cell snapshot
  loop each task unit
    API->>DB: Update unit.cell_id -> from_cell_id (best effort)
    API->>DB: Insert unit_moves for successful returns
  end
  API->>DB: Update task.status=canceled
  API->>Audit: picking_task_canceled
  API-->>OPS: { ok: true, units_returned }
```

### 5) Return from OUT to BIN

```mermaid
sequenceDiagram
  actor Operator
  participant API as API /api/units/move
  participant RPC as RPC move_unit_to_cell

  Operator->>API: POST { unitId, toCellId(bin), toStatus=bin }
  API->>RPC: move_unit_to_cell(...)
  RPC-->>API: move result
  API-->>Operator: updated status/location
```

## Unit Status State Diagram

```mermaid
stateDiagram-v2
  [*] --> bin: Initial placement

  bin --> stored: Move to storage cell
  bin --> shipping: Move to shipping cell
  bin --> rejected: Move to rejected cell
  bin --> ff: Move to ff cell

  stored --> shipping: Re-route
  shipping --> stored: Re-route

  stored --> picking: TSD move to picking
  shipping --> picking: TSD move to picking

  stored --> rejected: Exception flow
  shipping --> rejected: Exception flow
  stored --> ff: Exception flow
  shipping --> ff: Exception flow

  rejected --> rejected: Internal move
  rejected --> ff: Re-process
  rejected --> stored: Re-process
  rejected --> shipping: Re-process

  ff --> ff: Internal move
  ff --> stored: Re-process
  ff --> shipping: Re-process

  picking --> out: Ship-out
  out --> bin: Return flow
```

## Picking Task State Diagram

```mermaid
stateDiagram-v2
  [*] --> open: OPS/Admin/Manager/Logistics create task
  open --> in_progress: TSD starts task
  open --> done: Ship-out auto-completes related task
  in_progress --> done: TSD completes move / ship-out auto-complete
  open --> canceled: OPS/Admin cancel
  in_progress --> canceled: OPS/Admin cancel

  done --> [*]
  canceled --> [*]
```

