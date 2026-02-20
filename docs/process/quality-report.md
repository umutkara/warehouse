# Process Quality Report

This report captures the current reliability state of critical warehouse process flows.

## Snapshot

- Date: 2026-02-20
- Scope: `move`, `ship-out`, `picking-task cancel`, `return out -> bin`
- Current gate status:
  - `npm run check:process-guard` -> pass
  - `npm run typecheck` -> pass
  - `npm test` -> pass
  - `npm run test:coverage` -> pass

## Coverage Snapshot (critical routes)

- `app/api/units/move/route.ts`
  - statements/lines: ~85.39%
  - branches: ~65.51%
  - functions: 100%
- `app/api/logistics/ship-out/route.ts`
  - statements/lines: ~90.77%
  - branches: ~71.42%
  - functions: 100%

## Invariant Coverage Status

- Covered and enforced in CI:
  - `INV-01..INV-12` from `docs/process/invariants.md`
- Mapping source:
  - `docs/process/test-matrix.md`
- Recent completion:
  - `ship-out` `hub_worker` admin RPC fallback contract checks added.
  - `picking-task cancel` partial unit move failure tolerance check added.
  - `ship-out` transfer creation branches (`hub` and `explicit transfer`) contract checks added.

## Residual Risks

1. Branch coverage for complex happy-path alternatives in `ship-out` is still moderate.
2. Integration depth is limited (mock-heavy contracts, no full DB lifecycle tests yet).
3. DB-backed end-to-end validation is still pending for full lifecycle confidence.

## P0 Next Backlog

1. Add DB-backed end-to-end smoke for `create task -> ship-out -> cancel/return` in isolated environment.
2. Raise branch threshold for critical API flows incrementally after stabilizing e2e checks.
3. Add historical regression pack from real incidents (bug replay tests).

## P1 Next Backlog

1. Add process dashboard markdown section with weekly trend (coverage + failed gate counts + regression count).
2. Add test data factories for common warehouse scenarios.
3. Expand negative-path contracts for rarely used role combinations.
