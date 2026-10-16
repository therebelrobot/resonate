# ADR-0002 — Stretch and Flow phase correction (fold Air Only into Phase 1)

Status: Accepted
Date: 2026-10-15
Supersedes: [ADR-0001](adr-0001-stretch-and-flow-phase-model.md)
Related: [`docs/specs/stretch-and-flow.md`](stretch-and-flow.md) §2.2, §4.2

## Context

ADR-0001 modelled the handout as an **Air Only** foundation stage followed by
four numbered phases, and recorded that "Phase 2's step sequence" and "Phase 2/3
voicing ratios" were **[not printed]**. Those claims came from a text extraction
that read the multi-column handout linearly.

Page-7 screenshots (`docs/REFERENCE/SCR-20261015-sjcy.png`,
`SCR-20261015-sjfa.png`) show the handout prints, under the heading **Phase 1**,
the Air Only steps; **Phase 2** at 20% sound / 80% air; **Phase 3** at
50% sound / 50% air; and **Phase 4** as progression guidance. The extraction had
shifted every phase down by one, invented the "Air Only foundation" (which is
really Phase 1), and left the real Phase 2 empty — so the editor rendered
"Steps not printed in the handout." for a phase that plainly has steps.

## Decision

1. Model **four numbered phases only**. **Phase 1 is Air Only**
   (`phaseNumber: 1`, `ratio: 'airOnly'`); there is no separate `airOnly` stage.
2. **Phase 2 = 20% sound / 80% air**, **Phase 3 = 50% sound / 50% air**, each
   with the shared five-step shape and tissue still in use.
3. **Phase 4 is progression guidance** (`ratio: null`, `stepsNotPrinted: true`).
4. The handout's **"Toggle 1 & 2"** note belongs to Phase 1 and Phase 2, so
   `toggledAirOnlyAndVoiced` is offered on those stages, not Phase 4.
5. Keep ADR-0001's storage tolerance (`MAX_STRETCH_AND_FLOW_PHASE = 50`); a
   stored stage id `airOnly` renders as "Phase 1 (recorded before the stage merge)".
6. Reconstruct the affected `shared/protocol.ts` values, tests, and spec §2.

## Rationale

- **The screenshots are the primary source.** The handout is a fixed printed
  page; the extraction was a lossy intermediate, and where the two disagree the
  printed page wins.
- **A phase that has steps must not say it has none.** The user-visible bug
  ("Phase 2 doesn't exist") is a correctness failure, not a copy nit.
- **Four phases, not five.** The handout numbers four. Inventing a fifth
  (Air Only) made the app's "Phase N" disagree with the handout the user is
  reading from.

## Consequences

- A session stored with `stageId: 'airOnly'` is read as Phase 1; the label
  helper maps the legacy id so history still renders. Re-selecting a stage in
  the editor rewrites it to `phase1`.
- ADR-0001's phase-number tolerance (`1..50`) is unchanged; legacy values > 4
  still load and still read "Phase N (not in the current handout)".
- The Phase 4 guidance text moved from `phase3` to `phase4`, and the 50/50 ratio
  moved from `phase4` to `phase3`.

## Alternatives considered

- **Keep the Air Only foundation and shift the numbering.** Rejected: the app's
  "Phase N" would no longer match the handout the user reads, reintroducing the
  same class of confusion.
- **Leave Phase 2/3 as "not printed".** Rejected: factually wrong against the
  primary source.
