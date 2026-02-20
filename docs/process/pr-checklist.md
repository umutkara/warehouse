# PR Checklist for Process Safety

Use this checklist for any PR touching `app/api/**` or process docs.

- [ ] Process behavior change is reflected in `docs/process/README.md` diagrams.
- [ ] Affected invariants are updated in `docs/process/invariants.md`.
- [ ] Test mapping is updated in `docs/process/test-matrix.md`.
- [ ] Added/updated at least one automated test per changed invariant.
- [ ] If `app/api/**` changed, PR also updates `tests/**` or `docs/process/**`.
- [ ] `npm run typecheck` passes locally.
- [ ] `npm test` passes locally.
- [ ] `npm run test:coverage` passes locally.
- [ ] Error status codes remain stable (or are intentionally documented).
- [ ] Side-effects are validated (audit, tasks, meta, transfer dedupe) for changed flows.
- [ ] No silent fallback that hides process failures without logging.
- [ ] Reviewer confirms invariant coverage before merge.
