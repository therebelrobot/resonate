# Resonance Practice and Carry-Over Practice — Tracking Spec

Status: Draft for review
Owners: Engineering (with Product/Design review for UI copy)
Framework phase: RRF phase 5 (Technical Architecture), feeding phase 7 (story breakdown)
Source material: notes handed over by the speech-language pathologist, 2026-10-15 (transcribed below). Nothing here is recoverable from a file in the repo; the notes are the single source.

Related: [`docs/specs/stretch-and-flow.md`](stretch-and-flow.md) (the pattern this spec follows), ADR-0003.

---

## 0. Source notes (verbatim) and transcription status

The SLP sent free-form notes. This is the raw text, kept so every claim below can be checked against it:

> Continue with vocal function exercises, especially glides & steps: start at ~350 Hz / F4, continue down the octave to ~175 / F3, then pay attention to where (in your ideal speaking range) you'd like your low note to be
>
> **Resonance Practice**
> - Warm up by contrasting high vs low resonance without vocal fold vibration (h sounds)
> - Use your pitch monitor to establish a comfortable pitch - gently add phonation (vowel sounds)
> - Modify vowels to humming sounds, then chant sentences
> - Finally, add intonation to sentences and repeat as many times as needed to achieve a more "regular" speech pattern:
>   - Mary made me mad
>   - Mother made marmalade
>   - Who knows the news
>   - William was waiting
>   - Where were we Wednesday
>
> **Carry Over Practice**
> - Think about voice during two conversations/week, schedule and include warm up time
> - Ex: peer programming
>
> https://acousticgender.space/
>
> Also: resource for starting to think about light vocal weight https://wiki.sumianvoice.com/wiki/pages/vocal-weight/?st_source=ai_overview

**Uncertainty register** (do not treat as fact):

| Item | Status |
|---|---|
| A weekly day cadence for Resonance Practice | **Not printed.** The app starts it at the VFE cadence (5-7 days) and flags it for confirmation with the SLP (§4.4). |
| A per-session duration for either new practice | **Not printed.** The app uses the same 5-15 minute band as VFE, flagged the same way. |
| The number of Resonance repetitions | The note says "as many times as needed"; recorded as a free count (§3.2). |
| F4 / F3 as exact frequencies | The note prints "~350 Hz / F4" and "~175 / F3". The app stores the printed approximations (349.23 Hz and 174.61 Hz, the true equal-temperament frequencies) as **targets**, not as rules. |
| Whether "steps" means POWER | Read as the POWER up/down steps, which the existing plan already defines (§1.1). |

---

## 1. Problem statement and scope

### 1.1 Problem

The tracker measures three tracks: Vocal Function Exercises (warm-up note, glides, POWER), Stretch and Flow, and Endurance. The new notes add:

1. a **pitch target** to the VFE glides and steps (start ~350 Hz / F4, down an octave to ~175 Hz / F3, then choose a comfortable low note for the ideal speaking range). Today pitch is free text (`startNote`/`topNote`/`bottomNote`, `client/screens/SessionEditor.tsx:354-372`) with no numbers, so the target cannot be measured against;
2. a whole new **Resonance Practice** with a fixed ladder (h-sounds with no voicing → pitch monitor + vowels → humming → chant sentences → intonation), five named sentences, and a comfortable-pitch value;
3. a new **Carry-Over Practice**: voice awareness during two conversations a week, with scheduled warm-up.

None of the three can be logged or measured today. The two new practices are not even parts of the `PracticeTrack`/`SegmentKind` unions (`shared/protocol.ts:15-26`), so the app cannot record them at all.

### 1.2 In scope

1. Add **Resonance** and **Carry-Over** as first-class tracks with their own segments, per-session minutes, and weekly targets, following how VFE/Stretch/Endurance are modelled.
2. Embed the Resonance ladder, the five sentences, the carry-over example, the pitch anchors, and the two reference links as structured, citable data in `shared/protocol.ts`.
3. Add structured **pitch fields** (Hz) to the VFE segments, with the note name derived, and surface distance-to-target.
4. Backward-compatible tracking fields for the Resonance and Carry-Over details, following the nested-object pattern the Stretch and Flow spec chose (§3.1 of that spec).
5. Derivable metrics, and coverage of every screen and both exports.
6. Accessibility requirements for the new UI, matching the Stretch and Flow spec's §8.

### 1.3 Out of scope

- Any change to the Stretch and Flow protocol content or its phase model.
- Audio recording, playback, real-time pitch detection, or a built-in tuner. The user reads the pitch off their own monitor and types it.
- Clinical decision-making: the app does not decide cadence or progression. Where the note is silent, the app states its default and says so (§4.4).
- Fetching or embedding the two reference links' content. They render as links only.
- Server-side schema migrations of stored blobs (none are needed — the blobs are opaque JSON; §6.2).

### 1.4 Success criteria

- A user can log a Resonance session (which rungs, comfortable pitch, which sentences, how many intonation passes) and a Carry-Over session (how many conversations, contexts, whether a warm-up was done).
- A user can log the high/low pitch of a VFE session in Hz and see the note name and the distance to F4/F3.
- Insights can show resonance minutes, sentences covered, the ladder rung reached, carryover conversations against the two-a-week target, and the pitch range over time — all with no server storage beyond the session blob.

---

## 2. Ground-truth content model

### 2.1 Resonance ladder (verbatim order, one rung per bullet)

| Rung id | Label | Source bullet |
|---|---|---|
| `contrastResonance` | Contrast high and low resonance, no voicing | "Warm up by contrasting high vs low resonance without vocal fold vibration (h sounds)" |
| `pitchMonitorVowel` | Find a comfortable pitch, add phonation | "Use your pitch monitor to establish a comfortable pitch - gently add phonation (vowel sounds)" |
| `humming` | Vowels to humming | "Modify vowels to humming sounds, then chant sentences" |
| `chantSentences` | Chant sentences | "…then chant sentences" |
| `intonation` | Add intonation, repeat | "Finally, add intonation to sentences and repeat as many times as needed to achieve a more 'regular' speech pattern" |

### 2.2 Resonance sentences (verbatim)

| Id | Text |
|---|---|
| `maryMadeMeMad` | Mary made me mad |
| `motherMadeMarmalade` | Mother made marmalade |
| `whoKnowsTheNews` | Who knows the news |
| `williamWasWaiting` | William was waiting |
| `whereWereWeWednesday` | Where were we Wednesday |

### 2.3 Carry-over material

The note gives one example and a behaviour.

| Id | Kind | Text |
|---|---|---|
| `peerProgramming` | `context` | Peer programming |

- Weekly target: **two conversations** (`CARRYOVER_WEEKLY_CONVERSATION_TARGET = 2`).
- The instruction "schedule and include warm up time" is modelled as a per-session checkbox (`warmedUpBefore`), not free text.

### 2.4 VFE pitch anchors

| Id | Label | Note name | Hz |
|---|---|---|---|
| `startF4` | Start | F4 | 349.23 |
| `octaveDownF3` | Down an octave | F3 | 174.61 |

The "ideal speaking range low note" has **no printed target**; it is free (the note says "pay attention to where you'd like your low note to be"). The app records it as `speakingRangeLowHz` and compares it to nothing.

### 2.5 Reference links

| Id | Label | URL | Note |
|---|---|---|---|
| `acousticGenderSpace` | acousticgender.space | https://acousticgender.space/ | A reference for exploring pitch and resonance (as sent). |
| `sumianVocalWeight` | Sumian Voice — Vocal weight | https://wiki.sumianvoice.com/wiki/pages/vocal-weight/?st_source=ai_overview | "Starting to think about light vocal weight" (as sent). |

Links render with `target="_blank"` and `rel="noreferrer"`, matching the app's `no-referrer` policy. They are navigations, not resource loads, so they are unaffected by the strict CSP (`README.md:144-151`).

---

## 3. Data model changes — `shared/model.ts`

### 3.1 Decision: nested objects, following the Stretch and Flow precedent

`SessionSegmentInput` is deliberately flat, with a nested `stretchAndFlow` object for the one variable-length detail (spec §3.1). Resonance and Carry-Over are the same shape of data (a per-rung list, a per-sentence list), and pitch is a small related triple. **Decision:** add three nested objects — `pitch`, `resonance`, `carryover` — and keep every existing flat field untouched.

- Existing stored sessions and every existing consumer keep working unchanged.
- The new complexity is isolated to three fields.
- Legacy rows get all three filled with `null` on read (§3.3), so downstream code never sees `undefined`.

Two-way door: the fields are optional on the wire and additive in storage, so reverting the code leaves stored sessions readable by the old code (the extra keys are ignored).

### 3.2 Types (additive)

```ts
// shared/model.ts — additive

/** VFE pitch, in Hz. The note name is derived for display, not stored (ADR-0003). */
export interface PitchWorkInput {
  /** Highest note reached this session, in Hz. */
  highHz: number | null
  /** Lowest note reached this session, in Hz. */
  lowHz: number | null
  /** The low note chosen for the ideal speaking range, in Hz. */
  speakingRangeLowHz: number | null
}

/** One rung of the Resonance ladder, as actually done. */
export interface ResonanceStepProgress {
  /** Stable id from RESONANCE_STEPS, e.g. 'contrastResonance'. */
  stepId: string
  completed: boolean
}

export interface ResonanceDetail {
  steps: ResonanceStepProgress[]
  /** The pitch found on the monitor, in Hz. Null when not recorded. */
  comfortablePitchHz: number | null
  /** Sentence ids practised, from RESONANCE_SENTENCES. */
  sentenceIds: string[]
  /** How many intonation passes were done. Null when not recorded. */
  intonationRepetitions: number | null
}

export interface CarryoverDetail {
  /** Conversations where voice was monitored. Null when not recorded. */
  conversationCount: number | null
  /** Context ids, from CARRYOVER_CONTEXTS. */
  contextIds: string[]
  /** Free text for contexts not in the catalog. */
  customContext: string
  /** Whether a warm-up was done before the conversation(s). */
  warmedUpBefore: boolean | null
}
```

Add to `SessionSegmentInput` (after `stretchAndFlow`, `shared/model.ts:117`):

```ts
  /** VFE pitch work (glides and POWER); null for other kinds and legacy rows. */
  pitch: PitchWorkInput | null
  /** Resonance Practice detail; null for other kinds and legacy rows. */
  resonance: ResonanceDetail | null
  /** Carry-Over Practice detail; null for other kinds and legacy rows. */
  carryover: CarryoverDetail | null
```

Add to `createEmptySegmentInput` (`shared/model.ts:176`):

```ts
    pitch: null,
    resonance: null,
    carryover: null,
```

### 3.3 Backward compatibility

Old stored sessions have none of the three keys. Extend the existing read-time normalizer (`shared/model.ts:206`) rather than adding a second one:

```ts
export function normalizeSegmentInput(segment: SessionSegmentInput): SessionSegmentInput {
  if (segment.stretchAndFlow !== undefined && segment.pitch !== undefined && segment.resonance !== undefined && segment.carryover !== undefined) {
    return segment
  }
  return {
    ...segment,
    stretchAndFlow: segment.stretchAndFlow ?? null,
    pitch: segment.pitch ?? null,
    resonance: segment.resonance ?? null,
    carryover: segment.carryover ?? null,
  }
}
```

`server/repositories.ts:81-83` already applies it to every session on read; no repository change is needed beyond keeping that call.

### 3.4 Derived note names

Add to `shared/model.ts` (pure, shared by client and server):

```ts
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/**
 * Equal-temperament note name for a frequency, A4 = 440 Hz. Rounds to the
 * nearest semitone, so a good-faith reading of "about 350" comes out "F4".
 */
export function noteNameForHz(hz: number): string {
  const semitonesFromA4 = Math.round(12 * Math.log2(hz / 440))
  const noteIndex = ((semitonesFromA4 + 9) % 12 + 12) % 12
  const octave = 4 + Math.floor((semitonesFromA4 + 9) / 12)
  return `${NOTE_NAMES[noteIndex]}${octave}`
}
```

`noteNameForHz(349.23) === 'F4'` and `noteNameForHz(174.61) === 'F3'` are asserted in the protocol test.

---

## 4. Protocol definition changes — `shared/protocol.ts`

### 4.1 Tracks and segments

```ts
export const PRACTICE_TRACKS = ['vocalFunction', 'stretchAndFlow', 'resonance', 'carryover', 'endurance'] as const

export const SEGMENT_KINDS = [
  'warmupNote',
  'glides',
  'powerAscending',
  'powerDescending',
  'stretchAndFlow',
  'resonance',
  'carryover',
  'endurance',
] as const
```

Order rationale: voice warm-up (VFE) → breath/phonation shaping (Stretch and Flow) → resonance/speech shaping (Resonance) → real-world transfer (Carry-Over) → endurance reading. VFE stays first and Stretch and Flow keeps its place, so existing charts and screens do not reorder; the two new tracks slot in ahead of Endurance.

### 4.2 Embedded content (new exports)

```ts
export interface ResonanceStep { id: string; label: string; detail: string }
export const RESONANCE_STEPS: readonly ResonanceStep[] = [ /* §2.1 */ ]

export interface ResonanceSentence { id: string; text: string }
export const RESONANCE_SENTENCES: readonly ResonanceSentence[] = [ /* §2.2 */ ]

export interface CarryoverContext { id: string; text: string }
export const CARRYOVER_CONTEXTS: readonly CarryoverContext[] = [ /* §2.3 */ ]
export const CARRYOVER_WEEKLY_CONVERSATION_TARGET = 2

export interface PitchTarget { id: string; label: string; noteName: string; hz: number }
export const VFE_PITCH_TARGETS: readonly PitchTarget[] = [ /* §2.4 */ ]

export interface ProtocolReference { id: string; label: string; url: string; note: string }
export const PROTOCOL_REFERENCES: readonly ProtocolReference[] = [ /* §2.5 */ ]
```

Stable id tuples for `z.enum`, matching the Stretch and Flow pattern (`shared/protocol.ts:502`):

```ts
export const RESONANCE_STEP_IDS = ['contrastResonance', 'pitchMonitorVowel', 'humming', 'chantSentences', 'intonation'] as const
export const RESONANCE_SENTENCE_IDS = ['maryMadeMeMad', 'motherMadeMarmalade', 'whoKnowsTheNews', 'williamWasWaiting', 'whereWereWeWednesday'] as const
export const CARRYOVER_CONTEXT_IDS = ['peerProgramming'] as const
```

### 4.3 Segment and track definitions

Add `resonance` and `carryover` to `SEGMENT_DEFINITIONS` and `SEGMENT_TRACK`, and to `TRACK_DEFINITIONS`:

| Track | Short | Per session | Days/week | `dayCountsAtMinutes` |
|---|---|---|---|---|
| Resonance practice | Resonance | 5-15 min (default; not printed) | 5-7 (default; not printed) | 5 |
| Carry-Over practice | Carry-over | 5-15 min | 2-7 | 5 |

`glides` and `powerAscending`/`powerDescending` guidance gains the pitch anchors, verbatim where possible: "Start at about 350 Hz (F4), continue down the octave to about 175 Hz (F3), then choose where you want your low note in your ideal speaking range."

### 4.4 Cadence defaults where the note is silent

The note prints a cadence for Carry-Over ("two conversations/week") but **not** for Resonance, and neither practice has a printed duration. The app cannot show a target it does not have, and leaving the tracks untargeted would silently weaken the adherence screen. **Decision:** Resonance starts at the VFE band (5-15 min, 5-7 days); Carry-Over starts at 5-15 min and 2-7 days (two being the note's own number). Both `cadenceNote` fields say the cadence is a starting point to confirm with the SLP. This is recorded in ADR-0003 and is a two-way door (constants, changed in one place).

---

## 5. Metrics additions — `shared/metrics.ts`

All new metrics are **pure functions over stored sessions** (no new storage). Add:

```ts
export interface ResonanceSummary {
  minutes: number
  sessionCount: number
  /** distinct sentence ids practised across the sessions given. */
  sentenceIdsPractised: string[]
  /** The highest rung completed in the most recent recorded session. */
  latestTopStepId: string | null
  averageComfortablePitchHz: number | null
  /** Total intonation repetitions recorded. */
  totalIntonationRepetitions: number
}
export function resonanceSummary(sessions: readonly Session[]): ResonanceSummary

export interface CarryoverSummary {
  minutes: number
  sessionCount: number
  /** Total conversations where voice was watched. */
  conversationTotal: number
  /** distinct context ids used. */
  contextIdsUsed: string[]
  /** Sessions where a warm-up was recorded as done before the conversation(s). */
  warmedUpSessionCount: number
}
export function carryoverSummary(sessions: readonly Session[]): CarryoverSummary

/** Conversations logged in the trailing seven days, against the two-a-week target. */
export function carryoverConversationsThisWeek(sessions: readonly Session[], referenceDate: Date): number

export interface PitchRangeSummary {
  /** Highest note reached across sessions, in Hz. */
  highestHz: number | null
  /** Lowest note reached across sessions, in Hz. */
  lowestHz: number | null
  /** The most recently recorded ideal-speaking-range low note, in Hz. */
  latestSpeakingRangeLowHz: number | null
}
export function pitchRangeSummary(sessions: readonly Session[]): PitchRangeSummary
```

Extend `ProtocolHighlights` (`shared/metrics.ts:300`) with:

```ts
  resonanceMinutes: number
  resonanceSessionCount: number
  resonanceSentenceCount: number          // distinct sentences practised
  resonanceTopStepId: string | null       // latest rung completed
  averageResonancePitchHz: number | null
  carryoverMinutes: number
  carryoverSessionCount: number
  carryoverConversationTotal: number
  carryoverContextCount: number           // distinct contexts used
  highestPitchHz: number | null
  lowestPitchHz: number | null
```

`DailyTrendPoint` (`shared/metrics.ts:420`) gains `resonanceMinutes` and `carryoverMinutes`, and `dailyTrend` fills them.

Catalog-size constants for coverage counts:

```ts
export const RESONANCE_STEP_COUNT = RESONANCE_STEPS.length
export const RESONANCE_SENTENCE_COUNT = RESONANCE_SENTENCES.length
export const CARRYOVER_CONTEXT_COUNT = CARRYOVER_CONTEXTS.length
```

A Resonance or Carry-Over segment counts toward its metrics when it has time on it or a recorded detail — the same rule as `isCountedStretchSegment` (`shared/metrics.ts:533`).

---

## 6. Validation and persistence

### 6.1 `server/schemas.ts`

Add zod schemas mirroring §3.2. Follow the file's existing rule: **no `.default()`**.

```ts
const pitchWorkSchema = z.object({
  highHz: z.number().int().min(0).max(2_000).nullable(),
  lowHz: z.number().int().min(0).max(2_000).nullable(),
  speakingRangeLowHz: z.number().int().min(0).max(2_000).nullable(),
})

const resonanceStepProgressSchema = z.object({
  stepId: z.enum(RESONANCE_STEP_IDS),
  completed: z.boolean(),
})

const resonanceDetailSchema = z.object({
  steps: z.array(resonanceStepProgressSchema).max(10),
  comfortablePitchHz: z.number().int().min(0).max(2_000).nullable(),
  sentenceIds: z.array(z.enum(RESONANCE_SENTENCE_IDS)).max(20),
  intonationRepetitions: z.number().int().min(0).max(100).nullable(),
})

const carryoverDetailSchema = z.object({
  conversationCount: z.number().int().min(0).max(20).nullable(),
  contextIds: z.array(z.enum(CARRYOVER_CONTEXT_IDS)).max(20),
  customContext: z.string().max(2_000),
  warmedUpBefore: z.boolean().nullable(),
})
```

Add to `sessionSegmentInputSchema` (`server/schemas.ts:71`), all optional so a stale client is not rejected; the repository normalizes missing keys to null:

```ts
  pitch: pitchWorkSchema.nullable().optional(),
  resonance: resonanceDetailSchema.nullable().optional(),
  carryover: carryoverDetailSchema.nullable().optional(),
```

No `superRefine` cross-checks are needed: unlike the Stretch and Flow ratio/stage pair, none of the new fields has a derived partner.

### 6.2 Persistence impact — `server/repositories.ts`

Sessions are whole encrypted JSON blobs, so new fields persist automatically once the schema accepts them. The only repository behaviour is the existing read-time normalization (`server/repositories.ts:81-83`), extended in §3.3. The schema's segment cap stays 8; a session with every kind ticked uses exactly eight segments.

### 6.3 Security / privacy note

The new fields are health data (speech-therapy detail and voice pitch). They stay inside the encrypted session blob. They must not be added to analytics events. The external reference links are plaintext by design; they are not fetched by the app and carry no user data.

---

## 7. UI plan, section by section

### 7.1 SessionEditor — new steps and pitch fields (`client/screens/SessionEditor.tsx`)

1. Insert `resonance` and `carryover` into `EDITOR_STEPS` and `STEP_LABELS` between Stretch and Endurance (`SessionEditor.tsx:44-55`). The step track is already data-driven.
2. **Pitch fields** (new `PitchFields` component) rendered inside the Glides step and both POWER steps: three numeric Hz inputs (`highHz`, `lowHz`, `speakingRangeLowHz`) that display the derived note name and, for high/low, the distance to F4/F3 as a hint. Semantic `<input type="number" inputMode="numeric">` with a `<label for>`.
3. **Resonance step** (`ResonanceFields`): a rung checklist (`RESONANCE_STEPS`, checkbox per rung → `steps`), a comfortable-pitch Hz input (`comfortablePitchHz`, note name shown), a sentence checklist (`RESONANCE_SENTENCES` → `sentenceIds`), and an intonation-repetitions number input. The ladder is rendered in order.
4. **Carry-Over step** (`CarryoverFields`): a conversation count, a context checklist (`CARRYOVER_CONTEXTS`) plus a free-text "other context" field, and a `warmedUpBefore` checkbox. Show the two-a-week target as a hint.
5. Keep the existing minutes input, tags, and notes shared by every `PartStep`.

### 7.2 TodayScreen (`client/screens/TodayScreen.tsx`)

- The track cards already iterate `PRACTICE_TRACKS` (`TodayScreen.tsx:68`), so the two new tracks appear with no change.
- Add a compact "Resonance and carry-over" section: latest resonance rung reached, sentences covered, and conversations logged this week against the two-a-week target.

### 7.3 InsightsScreen (`client/screens/InsightsScreen.tsx`)

- A **Resonance** section: minutes, rung reached, sentence coverage (`n of 5`), average comfortable pitch, intonation repetition trend.
- A **Carry-Over** section: conversations this week against the target, distinct contexts used, warm-up adherence.
- A **Pitch** block folded into the existing POWER/Glides area or its own section: highest and lowest Hz with note names, and a trend line of the speaking-range low note.
- `DailyMinutesChart` picks up the two new tracks automatically once `charts.tsx` knows them (§7.7).

### 7.4 SessionDetailScreen (`client/screens/SessionDetailScreen.tsx`)

Add measure rows for pitch (high/low/speaking-range low, with note names), resonance (rungs, pitch, sentences, repetitions), and carry-over (conversations, contexts, warm-up), resolved to catalog text.

### 7.5 ProtocolScreen (`client/screens/ProtocolScreen.tsx`)

- New sections: **Resonance Practice** (the ladder as an ordered list, the five sentences, a repetition note), **Carry-Over Practice** (the two-a-week instruction and the example), and **Pitch targets** (F4 → F3).
- **References** section rendering `PROTOCOL_REFERENCES` as external links.
- The track cards already iterate `PRACTICE_TRACKS`, so the two new tracks appear automatically (`ProtocolScreen.tsx:47`).

### 7.6 ReportScreen and CSV export

- **ReportScreen** (`client/screens/ReportScreen.tsx`): add summary paragraphs for Resonance and Carry-Over; extend the per-session measure list (`ReportScreen.tsx:267-294`) with the new fields; add long-format CSV rows in `buildSlpCsvRows` for each new measurement.
- **Server CSV** (`server/csvExport.ts`): **append** new columns after the existing ones (never reorder). Proposed additions, in order: `Pitch High (Hz)`, `Pitch Low (Hz)`, `Speaking Range Low (Hz)`, `Resonance Steps`, `Resonance Sentences`, `Comfortable Pitch (Hz)`, `Intonation Repetitions`, `Carryover Conversations`, `Carryover Contexts`, `Warmed Up Before`, then the two new track-minute columns `Resonance Minutes`, `Carryover Minutes`. `PART_COLUMN_COUNT` is unchanged (the new per-part columns are appended in their own blocks, like the Stretch and Flow ones).

### 7.7 charts and styles

- `client/components/charts.tsx`: add the two tracks to `TRACK_FILL_CLASS` and extend `minutesOfTrack` to read `resonanceMinutes`/`carryoverMinutes`.
- `client/styles.css`: two new `chart-fill-*` classes reusing existing colour variables.

### 7.8 Seed tags (`server/seedTags.ts`)

Add a few starting tags that match the new work, all editable: `focus` gains "Resonance placement", "Light vocal weight", and "Intonation"; `utterance` gains "H sounds". Seeding only affects a fresh vault; existing vaults are untouched, which is expected.

---

## 8. Accessibility and inclusive design

Same rules as the Stretch and Flow spec's §8; the new code must meet them:

- **Semantic HTML before ARIA**: `<fieldset>`/`<legend>` for the rung and sentence checklists and the carry-over context list; native checkboxes and number inputs; no custom widgets.
- **Programmatic labels**: every Hz input and count is labelled with both its name and its unit ("High note (Hz)"); the derived note name is tied in with `aria-describedby`.
- **Target size** ≥ 24×24 CSS px, 44×44 preferred for the new chip/checkbox rows.
- **No colour-only encoding**: the new chart tracks carry text labels in the legend and in every list.
- **Reduced motion**: any new trend/entrance animation gated on `prefers-reduced-motion`.
- **Error messages**: out-of-range Hz or counts say what to fix without blame.
- **Keyboard**: the two new editor steps are completable by keyboard with a visible focus indicator.
- **Privacy**: the new fields are health data; keep them in the encrypted blob, out of analytics.

---

## 9. Backward compatibility and migration

- **No database migration.** Sessions are opaque encrypted blobs; new fields ride along automatically (§6.2).
- **Read-time normalization** (§3.3) fills the three new keys with `null` for legacy rows.
- **Tracks and segments are additive unions.** Existing stored sessions reference none of the new kinds. A session written by the new version contains new kinds; **reverting the code would make old code fail to resolve `SEGMENT_TRACK[segment.kind]` for those sessions**, so the data direction is a one-way door (ADR-0003). Keep a backup before rolling back a version that has written Resonance/Carry-Over sessions.
- **CSV columns are appended, never reordered** (§7.6), protecting downstream clinical mappings.
- **Existing metrics unchanged**; all new metrics are additive.

---

## 10. Test plan

### 10.1 Existing tests that change

| Test file | Change |
|---|---|
| `test/protocol.test.ts` | Add integrity assertions for the new catalogs and id tuples; assert `noteNameForHz(349.23) === 'F4'` and `noteNameForHz(174.61) === 'F3'`. |
| `test/metrics.test.ts` | `minutesByTrack` gains two tracks; add assertions for `resonanceSummary`, `carryoverSummary`, `carryoverConversationsThisWeek`, `pitchRangeSummary`, and the new `ProtocolHighlights` fields. |
| `test/csv.test.ts` | The appended columns are checked at fixed positions after the Stretch and Flow block. |
| `test/schemas.test.ts` | Accept a full pitch/resonance/carryover payload; reject an unknown step id, sentence id, and context id; reject an out-of-range Hz. |
| `test/api.test.ts` | Session round-trip includes the new objects. |

### 10.2 New unit tests

- **Protocol integrity**: every `stepId` in `RESONANCE_STEPS`/`RESONANCE_STEP_IDS` matches; every sentence id matches; `CARRYOVER_CONTEXT_IDS` matches the catalog; `VFE_PITCH_TARGETS` has the two anchors; `PROTOCOL_REFERENCES` has both links and unique ids.
- **Model**: `noteNameForHz` round-trips the printed anchors; `normalizeSegmentInput` fills all three new keys.
- **Metrics**: new counts ignore drafts (consistent with `shared/metrics.ts:84-87`); a zero-minute part with a recorded detail counts, a zero-minute empty part does not.
- **Pitch range**: `highestHz`/`lowestHz` are the max/min across sessions; `latestSpeakingRangeLowHz` takes the most recent.

### 10.3 New UI checks

- SessionEditor: the two new steps persist; the pitch fields show the right note name; keyboard-only completion.
- Today/Insights/Protocol/Report render the new content with text labels (no colour-only).
- Manual checks in `README.md` still apply.

---

## 11. Ordered implementation checklist

Contracts first, then data, then UI, then export.

1. **Protocol content** — add the new tracks/segments, `RESONANCE_STEPS`, `RESONANCE_SENTENCES`, `CARRYOVER_CONTEXTS`, `VFE_PITCH_TARGETS`, `PROTOCOL_REFERENCES`, the id tuples, and the segment/track definitions to `shared/protocol.ts`; add a protocol-integrity test.
2. **Data model** — add the §3.2 types, the three fields, `noteNameForHz`, and the extended normalizer to `shared/model.ts`; update `createEmptySegmentInput`; add model tests.
3. **Validation** — add the §6.1 zod schemas; add schema tests.
4. **Metrics** — add the §5 functions, catalog-size constants, and `ProtocolHighlights`/`DailyTrendPoint` fields; add unit tests.
5. **SessionEditor** — the two new steps and the pitch fields.
6. **Charts and styles** — the two new track colours and `minutesOfTrack`.
7. **SessionDetailScreen, TodayScreen, InsightsScreen** — surface the new measurements.
8. **ProtocolScreen** — render the ladder, sentences, carry-over, pitch targets, and references.
9. **ReportScreen + browser CSV** — summary paragraphs, per-session lines, long-format rows.
10. **Server CSV** — append the new columns; update `test/csv.test.ts`.
11. **Seed tags** — the new starting tags.
12. **README** — update "What it tracks" and the export notes.
13. **Accessibility pass** — target sizes, labels, contrast on the new UI.

Deploy ≠ launch: no feature-flag infrastructure exists in this repo; the new fields are additive and dormant until the editor writes them, so old sessions are unaffected.

---

## Appendix A — Decision record

- **ADR-0003** — Resonance and Carry-Over as first-class tracks; pitch stored as Hz with derived note names; cadence defaults where the notes are silent. See [`docs/specs/adr-0003-resonance-carryover-and-pitch.md`](adr-0003-resonance-carryover-and-pitch.md).
- **Decision (inline, §3.1)** — nested `pitch`/`resonance`/`carryover` objects over more flat fields. Rationale recorded in §3.1; not escalated to a separate ADR because it is a two-way door and follows the established `stretchAndFlow` precedent.
