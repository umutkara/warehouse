# Process Working Agreement

This agreement defines how developers and AI assistants change critical warehouse process logic safely.

## Scope

Apply these rules when a change touches:

- `app/api/**`
- Any flow documented in `docs/process/README.md`

## Required Change Protocol

1. **Identify impacted invariants**
   - Check `docs/process/invariants.md`.
   - Mark which invariant IDs are affected (for example `INV-06`, `INV-12`).

2. **Update process documentation**
   - If behavior changes, update sequence/state diagrams in `docs/process/README.md`.
   - Update the test mapping status in `docs/process/test-matrix.md`.

3. **Update automated checks**
   - Add or update tests in `tests/**`.
   - For every changed invariant, include at least one automated check.

4. **Run local gates before PR**
   - `npm run check:process-guard`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:coverage`

5. **Open PR with evidence**
   - Fill PR template sections:
     - impacted invariants,
     - tests added/updated,
     - diagram/doc updates,
     - validation commands and results.

## Merge Blocking Conditions

Do not merge if any condition is true:

- Critical flow changed without test/doc updates.
- Invariant mapping is outdated.
- Coverage gate fails.
- PR description does not specify impacted invariants.

## Review Expectations

- Reviewer verifies business behavior, not only code style.
- Reviewer checks side effects (audit logs, task status transitions, meta updates, transfer dedupe).
- Reviewer confirms that process documentation reflects final behavior.
