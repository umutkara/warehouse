# Invariant to Test Matrix

This matrix maps current invariants to automated checks and CI gates.

| Invariant | Endpoint/Flow | Test Type | File | Status |
| --- | --- | --- | --- | --- |
| INV-01 Auth | `/api/units/move` | Contract | `tests/api/units-move.contract.test.ts` | done |
| INV-01 Auth | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts` | done |
| INV-01 Auth | `/api/picking-tasks/[id]/cancel` | Contract | `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-02 Role gates | `ship-out + cancel` | Contract | `tests/api/ship-out.contract.test.ts`, `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-03 Move input contract | `/api/units/move` | Contract | `tests/api/units-move.contract.test.ts` | done |
| INV-04 Inventory lock mapping | `/api/units/move` | Contract | `tests/api/units-move.contract.test.ts` | done |
| INV-05 Move RPC delegation | `/api/units/move` | Contract | `tests/api/units-move.contract.test.ts` | done |
| INV-06 Move error mapping | `/api/units/move` | Contract | `tests/api/units-move.contract.test.ts` | done |
| INV-07 Ship-out success contract | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts` | done |
| INV-08 Hub worker fallback | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts` | done |
| INV-09 Ship-out side effects | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts` | done |
| INV-10 Transfer dedupe + branch creation | `/api/logistics/ship-out` | Contract | `tests/api/ship-out.contract.test.ts`, `tests/api/ship-out.transfer.contract.test.ts` | done |
| INV-11 Cancel terminal guard | `/api/picking-tasks/[id]/cancel` | Contract | `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-12 Cancel rollback + tolerance | `/api/picking-tasks/[id]/cancel` | Contract | `tests/api/picking-task-cancel.contract.test.ts` | done |
| INV-13 BIN ingress policy (scan) | `/api/units/move-by-scan` | Contract | `tests/api/units-move-by-scan.contract.test.ts` | done |
| INV-14 Return `out -> bin` | `return flow` | Integration | `tests/integration/return-flow.test.ts` | done |


## CI Gate Mapping

- `npm run typecheck` -> schema/type contract stability
- `npm test` -> process contract checks
- `npm run test:coverage` -> coverage threshold gate for critical API flows
- `npm run check:process-guard` -> fails if critical API changes miss tests/process docs
- workflow: `.github/workflows/build.yml` verify job blocks merge on red

## Quality Tracking

- Reliability snapshot and risk backlog: `docs/process/quality-report.md`

