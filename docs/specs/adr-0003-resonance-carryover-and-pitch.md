# ADR-0003 — Resonance and Carry-Over tracks, and pitch representation

Status: Accepted (2026-10-15)
Date: 2026-10-15
Related: [`docs/specs/resonance-and-carryover.md`](resonance-and-carryover.md)

## Context

The SLP's 2026-10-15 notes add (1) pitch targets to the existing Vocal Function Exercises, (2) a new **Resonance Practice** with a fixed five-rung ladder and five named sentences, and (3) a new **Carry-Over Practice** (voice awareness during two conversations a week, with scheduled warm-up). The tracker currently models exactly three tracks and six segment kinds (`shared/protocol.ts:15-26`), and pitch as free text (`startNote`/`topNote`/`bottomNote`).

Three decisions are not settled by the notes:

1. whether the new practices are their own tracks or parts of an existing one;
2. how pitch is represented;
3. what cadence/duration to use where the notes are silent.

Sessions are stored as opaque encrypted JSON blobs (`server/repositories.ts:85-133`); the only durable schema is the code's unions and the validating zod schema.

## Decision

1. **Resonance and Carry-Over are first-class `PracticeTrack`s**, with their own `SegmentKind`s, per-session minutes, weekly targets, and adherence rows — the same shape as Vocal Function, Stretch and Flow, and Endurance.
2. **Pitch is stored as Hz only** (`highHz`, `lowHz`, `speakingRangeLowHz` on a nested `pitch` object). The note name is **derived** for display (`noteNameForHz`, A4 = 440 Hz), never stored, so there is one source of truth.
3. **Where the notes are silent, the app states a default and says so.** Resonance starts at the VFE band (5-15 min, 5-7 days); Carry-Over starts at 5-15 min and 2-7 days, the two being the note's own number. Both `cadenceNote`s flag the cadence as a starting point to confirm with the SLP.
4. **Structured detail lives in nested objects** (`pitch`, `resonance`, `carryover`), following the `stretchAndFlow` precedent, rather than adding roughly a dozen more flat fields to the struct shared by every segment kind.

## Rationale

- **Tracks, not tags.** The practices have their own minutes, cadence, and clinical content, and the SLP treats them as named practices. Folding them under Vocal Function would hide adherence; tags alone would not track the ladder or the conversations. The existing track machinery (`trackProgress`, the Today cards, the report table) then works with no special cases.
- **Hz, not note names.** A pitch monitor reports Hz; the plan prints Hz with a note name as a gloss. Storing Hz keeps the precise reading and lets the display layer render the note name and the distance to F4/F3. Storing both would risk the two drifting apart.
- **Stated defaults over silence.** A track with no target cannot be shown with a target, and silently omitting the target would weaken the whole adherence screen for the new tracks. The note's own Carry-Over number is used where it exists; the VFE band is borrowed where it does not; both are labelled as provisional.
- **Nested over flat.** The new data is a per-rung list and a per-sentence list — variable-length, like the Stretch and Flow detail the flat struct was explicitly designed to avoid (`shared/model.ts:91-95`).

## Consequences

- Every loop over `PRACTICE_TRACKS` and every consumer of `SEGMENT_TRACK` now sees five tracks and eight kinds; charts, the report table, the CSV, and the filter chips pick the new ones up from the same arrays.
- **Data written by this version is a one-way door.** A stored session containing a `resonance` or `carryover` segment cannot be read by code that predates this ADR: `SEGMENT_TRACK[segment.kind]` and `SEGMENT_DEFINITIONS[segment.kind]` would be undefined. Rolling the code back requires restoring a pre-upgrade backup. (Storage is a blob; there is no migration to reverse.)
- The two new cadences are defaults, not clinical facts. If the SLP gives real numbers, they change in `TRACK_DEFINITIONS` alone.
- `noteNameForHz` must round to the nearest semitone; a very low or very high reading still yields a name rather than throwing.

## Alternatives considered

- **Model the new practices as tags under Vocal Function.** Rejected: no minutes, no cadence, no ladder or conversation metrics.
- **Model them as extra segments inside Vocal Function.** Rejected: the report and adherence screens would blur three distinct practices into one number, and the Carry-Over two-a-week target has no home.
- **Store Hz and the note name.** Rejected: two sources of truth for the same value.
- **Leave the new tracks untargeted (nullable cadence).** Rejected: a large refactor of `TrackProgress` and the adherence UI for a problem better solved by an explicit, documented default.
