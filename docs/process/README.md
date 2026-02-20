# Warehouse Process Contract

This folder defines the source-of-truth process contract for critical warehouse flows.

## Scope

- Move unit between cells (`/api/units/move`)
- Ship unit out (`/api/logistics/ship-out`)
- Return unit back from out flow

## Related Documents

- `docs/process/invariants.md`
- `docs/process/test-matrix.md`
- `docs/process/pr-checklist.md`
- `docs/process/working-agreement.md`
- `docs/process/quality-report.md`

## How to use

- Treat invariants as non-negotiable business rules.
- Update sequence diagrams when behavior changes.
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
  API->>API: Validate auth + payload
  API->>RPC: move_unit_to_cell(...)
  RPC->>DB: Validate warehouse/cell/inventory lock
  RPC->>DB: Update units (cell_id, optional status)
  RPC->>DB: Insert unit_moves audit trail
  RPC-->>API: { ok, fromCellId, toCellId, toStatus }
  API-->>Operator: 200 if ok, mapped error codes if not
```

### 2) Ship Out (`/api/logistics/ship-out`)

```mermaid
sequenceDiagram
  actor Logistic
  participant API as API /api/logistics/ship-out
  participant RPC as RPC ship_unit_out
  participant DB as DB picking_tasks + transfers + units
  participant Audit as audit_log_event

  Logistic->>API: POST { unitId, courierName }
  API->>API: Validate auth + role + warehouse
  API->>RPC: ship_unit_out(unitId, courierName)
  RPC-->>API: shipment result
  API->>DB: Auto-complete related picking tasks
  API->>DB: Update units.meta.ops_status=in_progress
  API->>DB: Create transfer if hub/explicit flow
  API->>Audit: logistics.ship_out + related events
  API-->>Logistic: { ok: true, shipment }
```

### 3) Return Unit From Out

```mermaid
sequenceDiagram
  actor Operator
  participant API as Return/Move API
  participant RPC as move_unit_to_cell
  participant DB as DB units + unit_moves

  Operator->>API: Return unit to target cell (usually bin)
  API->>RPC: move_unit_to_cell(...)
  RPC->>DB: Validate target cell
  RPC->>DB: Set unit cell and resulting status
  RPC->>DB: Append unit_moves record
  API-->>Operator: Updated status and location
```

## Status State Diagram

```mermaid
stateDiagram-v2
  [*] --> bin: Unit accepted

  bin --> stored: Approved for merchant return
  bin --> shipping: Sent to diagnostics
  bin --> rejected: Put to rejected cell
  bin --> ff: Put to FF cell

  stored --> picking: OPS creates picking task
  shipping --> picking: OPS creates picking task

  picking --> out: Logistics ship-out

  out --> bin: Returned back from delivery/service

  rejected --> storage: Re-processed
  rejected --> shipping: Re-processed
  ff --> storage: Re-processed
  ff --> shipping: Re-processed
```

## Picking Task State Diagram

```mermaid
stateDiagram-v2
  [*] --> open: Task created (OPS/Admin/Manager/Logistics)
  open --> in_progress: TSD starts task
  in_progress --> done: Units moved to picking / ship-out completes
  open --> canceled: OPS/Admin cancel task
  in_progress --> canceled: OPS/Admin cancel task

  done --> [*]
  canceled --> [*]
```

