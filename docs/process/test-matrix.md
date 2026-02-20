# Invariant to Test Matrix

This matrix maps process invariants to automated checks and CI gates.


| Invariant                  | Endpoint/Flow             | Test Type            | File                                    | Status      |
| -------------------------- | ------------------------- | -------------------- | --------------------------------------- | ----------- |
| INV-01 Auth                | `/api/units/move`         | Contract             | `tests/api/units-move.contract.test.ts` | done        |
| INV-01 Auth                | `/api/logistics/ship-out` | Contract             | `tests/api/ship-out.contract.test.ts`   | done        |
| INV-02 Warehouse boundary  | `/api/units/move`         | Contract             | `tests/api/units-move.contract.test.ts` | done        |
| INV-03 Inventory lock      | `/api/units/move`         | Contract             | `tests/api/units-move.contract.test.ts` | done        |
| INV-04 Cell validity       | `/api/units/move`         | Contract             | `tests/api/units-move.contract.test.ts` | done        |
| INV-10 Error contract      | `move + ship-out`         | Contract             | `tests/api/*.contract.test.ts`          | done        |
| INV-06 Ship out transition | `/api/logistics/ship-out` | Contract             | `tests/api/ship-out.contract.test.ts`   | done        |
| INV-06a Ship out fallback (`hub_worker`) | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts` | done |
| INV-07 Task completion     | `/api/logistics/ship-out` | Contract/Integration | `tests/api/ship-out.contract.test.ts`   | done        |
| INV-08 Ops meta update     | `/api/logistics/ship-out` | Contract/Integration | `tests/api/ship-out.contract.test.ts`   | done        |
| INV-09 Transfer dedupe     | `/api/logistics/ship-out` | Contract/Integration | `tests/api/ship-out.contract.test.ts`   | done        |
| INV-09a Hub transfer create branch | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.transfer.contract.test.ts` | done |
| INV-09b Explicit transfer create branch | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.transfer.contract.test.ts` | done |
| INV-11 Task lifecycle      | `/api/picking-tasks/[id]/cancel` | Contract      | `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-12 Cancel rollback     | `/api/picking-tasks/[id]/cancel` | Contract/Integration | `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-12a Cancel partial-failure tolerance | `/api/picking-tasks/[id]/cancel` | Contract | `tests/api/picking-task-cancel.contract.test.ts` | done |
| Return flow state          | `out -> bin`              | Integration          | `tests/integration/return-flow.test.ts` | done        |


## CI Gate Mapping

- `npm run typecheck` -> schema/type contract stability
- `npm test` -> process contract checks
- `npm run test:coverage` -> coverage threshold gate for critical API flows
- `npm run check:process-guard` -> fails if critical API changes miss tests/process docs
- workflow: `.github/workflows/build.yml` verify job blocks merge on red

## Quality Tracking

- Reliability snapshot and risk backlog: `docs/process/quality-report.md`

