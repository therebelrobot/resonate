# ADR-0001 — Stretch and Flow phase model

Status: Proposed
Date: 2026-10-08
Related: [`docs/specs/stretch-and-flow.md`](stretch-and-flow.md) §4.2

## Context

The Stretch and Flow handout ([`docs/reference/Stretch & Flow.pdf`](../reference/Stretch%20%26%20Flow.pdf), page 7) defines an **Air Only** foundation section followed by **four numbered phases** (Phase 1–4). The codebase currently models the phase as a single integer validated `1..50`:

- [`shared/protocol.ts:215`](../../shared/protocol.ts:215) — `FIRST_STRETCH_AND_FLOW_PHASE = 1`
- [`shared/protocol.ts:217`](../../shared/protocol.ts:217) — `MAX_STRETCH_AND_FLOW_PHASE = 50`
- [`server/schemas.ts:29`](../../server/schemas.ts:29) — `phaseNumber` int `1..50`, nullable

Sessions are stored as opaque encrypted JSON blobs ([`server/repositories.ts:76-124`](../../server/repositories.ts:76)), so any stored `phaseNumber` value is already persisted and cannot be cheaply rewritten.

## Decision

1. Treat **4 as the canonical numbered-phase set** (`LAST_STRETCH_AND_FLOW_PHASE = 4`, `STRETCH_AND_FLOW_PHASE_COUNT = 4`).
2. Model **Air Only as a foundation stage** with `phaseNumber: null`, not as a numbered phase.
3. **Keep `MAX_STRETCH_AND_FLOW_PHASE = 50` as a storage tolerance.** Validation continues to accept `1..50`; existing sessions with values > 4 keep loading.
4. The editor offers only the canonical stages. A stored value > 4 is displayed read-only as "Phase N (not in the current handout)" and is not selectable.

## Rationale

- **Rejecting stored values would be a one-way door on user data.** Any session already saved with a phase > 4 would fail validation on the next full-replacement PUT ([`server/schemas.ts:5-6`](../../server/schemas.ts:5) documents full-replacement semantics), effectively corrupting the user's history.
- **Silently clamping would falsify history.** Rewriting a stored 7 to 4 misrepresents what the user recorded.
- **Tolerance preserves both.** The canonical set drives the UI and new records; the wide validation range preserves old records.
- **Air Only is not numbered in the source.** The handout prints it as a distinct section before "Phase 1", so giving it `phaseNumber: null` matches the source and avoids inventing a phase 0.

## Consequences

- New code must not assume `phaseNumber <= 4` when reading stored data; it must handle the tolerant range.
- `currentStretchAndFlowPhase` ([`shared/metrics.ts:398`](../../shared/metrics.ts:398)) can still return a value > 4 for legacy data; the UI must render it gracefully.
- If the handout is later revised to add phases, extend `LAST_STRETCH_AND_FLOW_PHASE` and the stage list; the storage tolerance already accommodates it.

## Alternatives considered

- **Tighten validation to `1..4`.** Rejected: breaks existing sessions.
- **Clamp on read.** Rejected: falsifies history.
- **Model Air Only as phase 0.** Rejected: not numbered in the source; would require widening validation below 1.
