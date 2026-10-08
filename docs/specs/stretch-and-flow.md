# Stretch and Flow — Guided Protocol and Tracking Spec

Status: Draft for review
Owners: Engineering (with Product/Design review for UI copy)
Framework phase: RRF phase 5 (Technical Architecture), feeding phase 7 (story breakdown)
Source material: [`docs/reference/Stretch & Flow.pdf`](../reference/Stretch%20%26%20Flow.pdf) (Atempo Voice Center, Copyright 2020)

---

## 0. PDF extraction status and limitation

The handout file [`docs/reference/Stretch & Flow.pdf`](../reference/Stretch%20%26%20Flow.pdf) is **2 pages**. The two rendered pages carry the printed labels "Page 7" and "Page 9" and yield 142 lines of text. The file does **not** contain printed pages 1–6, 8, or 10+ — they are **not present in this file**, not merely unextracted. We therefore design against the content we can cite, and mark every gap explicitly.

**Uncertainty register** (do not treat as fact):

| Item | Status |
|---|---|
| True page count of the handout | 2 pages (printed labels "Page 7" and "Page 9") |
| Content of printed pages 1–6, 8, 10+ | Not present in this file |
| Phase 2 step sequence | Heading present on page 7; steps not printed on that page |
| Phase 2 voicing ratio | Not printed — unknown |
| Phase 3 voicing ratio | Not printed — Phase 3 is progression guidance, not a step list |
| Whether "Air Only" is a numbered phase or a pre-phase foundation | Interpreted as a foundation stage (see §2.2) |

Nothing in §3–§11 depends on the missing pages.

---

## 1. Problem statement and scope

### 1.1 Problem

The app tracks Stretch and Flow as a single integer (`phaseNumber`) plus one quality slider (`coordinationRating`). The handout, however, defines a **structured protocol**: an ordered sequence of stages, a per-stage voicing ratio, a fixed 5-step exercise shape, a set of global cues, pacing/safety rules, and a catalog of carryover material. Today the app:

- cannot tell the user *what to do* in a given phase (no step content, no cues);
- cannot record *what was actually done* (ratio, breath counts, tissue use, step completion, cue adherence, carryover material);
- cannot show *progress through the protocol* (time-in-phase, ratio trends, carryover coverage);
- expects the user to paste the handout into a free-text note ([`client/screens/ProtocolScreen.tsx:8-19`](../../client/screens/ProtocolScreen.tsx:8)) instead of embedding the protocol.

The gap list from reconnaissance (items 1–12) is the authoritative backlog this spec resolves.

### 1.2 In scope

1. Embed the extractable handout content as structured, citable data in `shared/protocol.ts`.
2. Add backward-compatible tracking fields for ratio, breath counts, tissue use, step completion, cue adherence, and carryover material.
3. Add derivable metrics for time-in-phase, ratio/breath-count trends, cue adherence, and carryover progress.
4. Guide the user at the point of logging (SessionEditor) and surface progress (Today, Insights, Detail, Protocol, Report, CSV).
5. Accessibility and inclusive-design requirements for the new UI.

### 1.3 Out of scope

- Any change to the VFE (warm-up/glides/POWER) or Endurance tracks.
- Audio recording, playback, or automatic speech analysis.
- Clinical decision-making: the app does **not** decide when a user advances phases. Phase progression remains SLP-directed (see §4.4).
- Recovering the missing PDF pages (blocked on tooling; see §0).
- Server-side schema migrations of stored blobs (none are needed — see §6.2).
- Multi-user / RBAC changes. The app is single-user, vault-encrypted.

### 1.4 Success criteria

- A user on any phase can open the Stretch step and see the exact steps, ratio, cues, and pacing for that phase, sourced from `shared/protocol.ts`.
- A completed session records enough to reconstruct: which stage, which ratio, which steps were done, breath counts reached, whether tissue was used, which cues were checked, and which carryover material was practiced.
- Insights can show time-in-phase and carryover coverage without any new server storage beyond the session blob.

---

## 2. Ground-truth content model (from the PDF)

Everything in this section is transcribed from the extractable pages. Wording is preserved; only obvious line-wrap artifacts are joined. Anything not printed is marked **[not printed]**.

### 2.1 Global cues (page 7, lines 4–6)

| Cue id | Text (verbatim) |
|---|---|
| `avoidPressedWhisper` | Avoid pressed whisper |
| `elongateVowels` | Vowels elongated |
| `roundLips` | Lips can be rounded |

### 2.2 Stages, ratios, and tissue state

The handout presents an **Air Only** foundation section, then numbered **Phase 1–4**. We model these as five ordered *stages*; only the numbered ones carry a `phaseNumber`.

| Stage id | Label | Voicing ratio | Tissue | Source |
|---|---|---|---|---|
| `airOnly` | Air Only | Air only (derived; the handout does not print a percentage) | Yes — "Blow the tissue 5-7 times" | page 7, lines 8–19 |
| `phase1` | Phase 1 | 20% sound / 80% air | Yes — "still with tissue" | page 7, lines 20–32 |
| `phase2` | Phase 2 | **[not printed]** | **[not printed]** | page 7, line 33 (heading only) |
| `phase3` | Phase 3 | **[not printed]** — progression guidance, not a step list | Optional — "consider dropping the tissue" | page 7, lines 34–49 |
| `phase4` | Phase 4 | 50% sound / 50% air | Yes — "still with tissue" | page 7, lines 50–78 |

### 2.3 The 5-step exercise shape (per stage)

Air Only, Phase 1, and Phase 4 each print the **same five-step shape**, differing only in the ratio prefix and the first step's tissue instruction. Phase 2's steps are **[not printed]**; Phase 3 is guidance, not a step list.

| Step id | Step 1 (open throat) | Step 2 | Step 3 | Step 4 | Step 5 |
|---|---|---|---|---|---|
| Air Only | open throat on "oooo" vowel → Blow the tissue 5–7 times | One number per breath, count 2–10, elongate vowels | Two numbers per breath, count 1–10, elongate vowels | Three numbers per breath, count 1–9 | Five numbers per breath, count 1–10 |
| Phase 1 | 20% sound/80% air, open throat on "oooo" vowel (still with tissue) | 20% sound/80% air, one number per breath, count 2–10, elongate vowels | 20% sound/80% air, two numbers per breath, count 1–10, elongate vowels | 20% sound/80% air, three numbers per breath, count 1–9 | 20% sound/80% air, five numbers per breath, count 1–10 |
| Phase 4 | 50% sound/50% air, open throat on "oooo" vowel (still with tissue) | 50% sound/50% air, one number per breath, count 2–10, elongate vowels | 50% sound/50% air, two numbers per breath, count 1–10, elongate vowels | 50% sound/50% air, three numbers per breath, count 1–9 | 50% sound/50% air, five numbers per breath, count 1–10 |

Canonical step ids (stable, used by the data model in §3):

| Step id | Numbers per breath | Count range | Elongate vowels |
|---|---|---|---|
| `openThroat` | — (tissue blow 5–7 times) | — | — |
| `oneNumber` | 1 | 2–10 | Yes |
| `twoNumbers` | 2 | 1–10 | Yes |
| `threeNumbers` | 3 | 1–9 | — |
| `fiveNumbers` | 5 | 1–10 | — |

### 2.4 Pacing and safety (page 7, lines 51–80)

| Id | Text (verbatim) | Source |
|---|---|---|
| `toggleRationale` | Remember, the idea is that the patient gets very good at toggling back and forth between the air only productions, and the voiced productions. Spend time either at the very beginning of introducing "air only" to the patient on the "ooo" vowel to toggle back and forth between these two phases without and then with voicing. | lines 51–61 |
| `toggleInstruction` | Toggle 1 & 2 | line 62 |
| `goSlowly` | Go SLOWLY! | line 63 |
| `catchBreath` | Take time between productions to catch breath | lines 64–66 |
| `preventDizziness` | TIPS: This is to prevent dizziness | lines 79–80 |

### 2.5 Phase 3 progression guidance (page 7, lines 35–49)

| Id | Text (verbatim) |
|---|---|
| `roteInEitherPhase` | Can do months of the year, days of the week in either Phase 1 or Phase 2 positions. |
| `dropTissue` | If you haven't already, consider dropping the tissue as the visual feedback and allow the patient to rely on their motor memory. |
| `appropriateVoice` | Carryover into an appropriate sounding voice that is not too breathy, but remains supported and open is key. |
| `advanceIfNeeded` | Advance to single words that are not rote, phrases, paragraphs only if needed. |
| `dailyCarryover` | Carrying this over into phrases that the patient uses daily, How-to stories that the patient recites (like how to build a snowman or how to make a sandwich) and then in conversational opportunities will be most applicable. |

### 2.6 Carryover material catalog (page 9)

**Rote tasks** (lines 84–85): `daysOfWeek` — Days of the week; `monthsOfYear` — Months of the year.

**Single words** (lines 86–88), 18 items, verbatim order:

| # | Word | # | Word | # | Word |
|---|---|---|---|---|---|
| 1 | Free | 7 | Hooray | 13 | When |
| 2 | Fine | 8 | Hear | 14 | Hoot |
| 3 | Fun | 9 | Where | 15 | Flow |
| 4 | Hug | 10 | Who | 16 | Fool |
| 5 | Which | 11 | Frisk | 17 | Friend |
| 6 | How | 12 | What | 18 | Hand |

**Sentences** (lines 90–102), 7 items, verbatim:

1. When Harold whistled a whimsical tune, white fairies arrived.
2. Houdini hankered for free funds.
3. Five white rabbits hid huddled beneath the hollows.
4. Our hill country used to be flat and empty.
5. Wine, cheese and sentiment are all we need for friends.
6. Five fine fantastic frogs whispered across the water.
7. Winter winds whipped while snow whirled around.

**Paragraphs** (lines 103–140), 3 items, verbatim:

- `wilber` — Paragraph 3: "Wilber was a wimpy, wandering hog who wanted nothing more than to achieve the highest honor. He worked day and night while working two jobs on Ferdinand's farm. One fine, fair day, Wilber was hard at work on a hunt, when a hare hobbled into his way. With one leg hurt, the hare was hindered. Wilber offered a home to him and he healed."
- `wanda` — Conversation Level, Paragraph 1: "In a blink of an eye, the weather can change for the worse. Just yesterday, Wanda was watching her wild children when suddenly a wind like she had never seen whipped her windows shut. With a worried look in her eyes, she gathered wee little Willie, Wendy and Walter and huddled them into the storm cellar. With wonder, all three followed their widowed mother. As the tornado passed and sirens wailed, all knew they were safe with each other."
- `henrietta` — Conversation Level, Paragraph 2: "Who hasn't heard of Henrietta? Her favorite hosting past time was when hyenas hooted and hollered in the Sahara. Whenver and wherever she is able, Henrietta and her hindsight, have opened the door to here and there. High and low, her search wants to know, who loves hairstyles and hula hoops? I haven't the idea you seek, but honestly, who does?"

> Note: "Whenver" is transcribed verbatim from the source (line 134). Do not silently correct it; if the app normalizes spelling elsewhere, flag this one for the SLP.

**Carryover activities** (lines 112–118):

| Id | Text (verbatim) |
|---|---|
| `dailyPhrases` | 10-15 phrases the patient uses daily |
| `howToStories` | How-To stories like how to load the laundry or how to brush teeth |
| `perfectDay` | Describe your perfect day |
| `jobDuties` | Describe your job duties |
| `conversation` | Conversation about any topic the patient likes |

---

## 3. Data model changes — `shared/model.ts`

### 3.1 Decision: structured object, not more flat fields

The existing `SessionSegmentInput` is deliberately flat: "Every field is always present; the ones a given part does not use stay null" ([`shared/model.ts:45-49`](../../shared/model.ts:45)). That works for scalars. The new Stretch/Flow data is **nested and variable-length** (a per-step list, a cue list, a carryover selection). Flattening it would add roughly ten parallel fields and several parallel arrays to a struct shared by every segment kind, which is exactly the bookkeeping the flat design was avoiding.

**Decision:** keep the two existing flat fields (`phaseNumber`, `coordinationRating`) for backward compatibility and to avoid touching existing metrics/CSV, and add **one optional nested object** `stretchAndFlow: StretchAndFlowDetail | null` that holds the new data. Justification:

- Existing stored sessions and every existing consumer keep working unchanged.
- The new complexity is isolated to one field, so the flat contract for other segment kinds is untouched.
- The nested shape maps 1:1 to the protocol definitions in §4, so the editor can render it generically.

### 3.2 Proposed types (additive)

```ts
// shared/model.ts — additive

export const STRETCH_AND_FLOW_RATIOS = ['airOnly', 'twentyEighty', 'fiftyFifty'] as const
export type StretchAndFlowRatio = (typeof STRETCH_AND_FLOW_RATIOS)[number]

export const STRETCH_AND_FLOW_CARRYOVER_KINDS = [
  'rote',
  'singleWord',
  'sentence',
  'paragraph',
  'dailyPhrase',
  'howToStory',
  'conversation',
] as const
export type StretchAndFlowCarryoverKind = (typeof STRETCH_AND_FLOW_CARRYOVER_KINDS)[number]

/** One row of the 5-step shape, as actually performed. */
export interface StretchAndFlowStepProgress {
  /** Stable id from STRETCH_AND_FLOW_STEPS, e.g. 'oneNumber'. */
  stepId: string
  completed: boolean
  /** The count the user reached, e.g. 10. Null when not recorded. */
  breathCount: number | null
}

export interface StretchAndFlowCarryoverLog {
  kind: StretchAndFlowCarryoverKind | null
  /** Ids into STRETCH_AND_FLOW_CARRYOVER, e.g. 'free', 'wilber'. */
  itemIds: string[]
  /** Free text for daily phrases, how-to stories, or conversation topics. */
  customText: string
}

export interface StretchAndFlowDetail {
  /** Which stage was practiced. Null when not recorded. */
  stageId: string | null
  ratio: StretchAndFlowRatio | null
  /** Whether the tissue was used this session. Null when not recorded. */
  usedTissue: boolean | null
  steps: StretchAndFlowStepProgress[]
  /** Cue ids checked this session, from STRETCH_AND_FLOW_CUES. */
  cuesChecked: string[]
  /** Phase 4 only: did the user toggle air-only and voiced productions. */
  toggledAirOnlyAndVoiced: boolean | null
  carryover: StretchAndFlowCarryoverLog | null
}
```

Add to `SessionSegmentInput` (after line 69):

```ts
  /** Stretch and Flow — structured detail; null for other kinds and legacy rows. */
  stretchAndFlow: StretchAndFlowDetail | null
```

Add to `createEmptySegmentInput` (after line 144):

```ts
    stretchAndFlow: null,
```

### 3.3 Backward compatibility

Old stored sessions have no `stretchAndFlow` key. Because sessions are opaque encrypted JSON blobs (§6.2), the field is simply absent on read. To keep downstream code simple, add a normalizer and apply it on read:

```ts
// shared/model.ts — additive
export function normalizeSegmentInput(segment: SessionSegmentInput): SessionSegmentInput {
  return segment.stretchAndFlow === undefined ? { ...segment, stretchAndFlow: null } : segment
}
```

Apply it in `SessionRepository.listAll`/`get` ([`server/repositories.ts:79-90`](../../server/repositories.ts:79)) so every `Session` handed to metrics/UI has the key present. This is a read-time normalization, not a data migration.

---

## 4. Protocol definition changes — `shared/protocol.ts`

### 4.1 Embed the content

Add structured, citable definitions alongside the existing `SEGMENT_DEFINITIONS`/`TRACK_DEFINITIONS`. Proposed exports:

```ts
export interface StretchAndFlowCue { id: string; text: string }
export const STRETCH_AND_FLOW_CUES: readonly StretchAndFlowCue[] = [
  { id: 'avoidPressedWhisper', text: 'Avoid pressed whisper' },
  { id: 'elongateVowels', text: 'Vowels elongated' },
  { id: 'roundLips', text: 'Lips can be rounded' },
]

export interface StretchAndFlowStep {
  id: string
  label: string
  numbersPerBreath: number | null
  countRange: { min: number; max: number } | null
  elongateVowels: boolean
  /** First step only: blow the tissue this many times. */
  tissueBlows: { min: number; max: number } | null
}
export const STRETCH_AND_FLOW_STEPS: readonly StretchAndFlowStep[] = [ /* §2.3 */ ]

export interface StretchAndFlowStage {
  id: string
  label: string
  /** Numbered phases only; null for the Air Only foundation. */
  phaseNumber: number | null
  ratio: StretchAndFlowRatio | null
  ratioLabel: string | null
  tissue: 'required' | 'optional' | 'unknown'
  /** Step ids in order; empty when the handout does not print steps. */
  stepIds: readonly string[]
  guidance: readonly string[]
  /** True when the handout does not print this stage's steps. */
  stepsNotPrinted: boolean
}
export const STRETCH_AND_FLOW_STAGES: readonly StretchAndFlowStage[] = [ /* §2.2 */ ]

export interface StretchAndFlowCarryoverItem {
  id: string
  kind: StretchAndFlowCarryoverKind
  text: string
}
export const STRETCH_AND_FLOW_CARRYOVER: readonly StretchAndFlowCarryoverItem[] = [ /* §2.6 */ ]

export const STRETCH_AND_FLOW_PACING: readonly { id: string; text: string }[] = [ /* §2.4 */ ]
```

`SEGMENT_DEFINITIONS.stretchAndFlow.guidance` ([`shared/protocol.ts:91-95`](../../shared/protocol.ts:91)) should be replaced with guidance that points at the embedded stages rather than the current generic "phase 1: coordinating diaphragmatic breathing with phonation" line.

### 4.2 Phase count conflict — `MAX_STRETCH_AND_FLOW_PHASE = 50`

The PDF defines **four numbered phases** (plus the Air Only foundation). The code allows `1..50` ([`shared/protocol.ts:217`](../../shared/protocol.ts:217), [`server/schemas.ts:29`](../../server/schemas.ts:29)).

**Decision (see ADR-0001):** treat **4 as the canonical numbered-phase set** while remaining **tolerant of stored higher values**.

- Add `LAST_STRETCH_AND_FLOW_PHASE = 4` and `STRETCH_AND_FLOW_PHASE_COUNT = 4` as the canonical set.
- Keep `MAX_STRETCH_AND_FLOW_PHASE = 50` as a **storage tolerance** so existing sessions with values > 4 still load and validate. Do not reject them.
- The editor offers only the canonical stages (Air Only + Phase 1–4). A stored value > 4 is displayed read-only as "Phase N (not in the current handout)" and is not selectable.
- Rationale: rejecting stored values would break existing sessions (a one-way door on user data); silently clamping would falsify history. Tolerance preserves both.

### 4.3 Ratio ↔ stage consistency

`STRETCH_AND_FLOW_STAGES` is the single source of truth for ratio. The editor derives the ratio from the selected stage; the user does not pick ratio independently. This prevents contradictory records (e.g. stage `phase1` with ratio `fiftyFifty`).

### 4.4 Progression gating

The handout does not define numeric advancement criteria; it says the SLP decides ("Ask your SLP at the next session what moves you to the next phase", [`shared/protocol.ts:94`](../../shared/protocol.ts:94)). Therefore:

- The app **does not gate** phase advancement.
- The app **may** surface a non-blocking readiness checklist (e.g. "all 5 steps completed", "cues checked", "carryover practiced") as information for the SLP conversation. It must never auto-advance or block.

---

## 5. Metrics additions — `shared/metrics.ts`

All new metrics are **pure functions over stored sessions** (no new storage). Add:

```ts
export interface StretchAndFlowPhaseSpan {
  stageId: string
  phaseNumber: number | null
  firstSeenAt: string
  lastSeenAt: string
  sessionCount: number
  minutes: number
}
/** Time-in-phase: contiguous spans of the same stage, oldest first. */
export function stretchAndFlowPhaseTimeline(sessions: readonly Session[]): StretchAndFlowPhaseSpan[]

export interface StretchAndFlowRatioBreakdown {
  minutesByRatio: Record<StretchAndFlowRatio, number>
  sessionCountByRatio: Record<StretchAndFlowRatio, number>
}
export function stretchAndFlowRatioBreakdown(sessions: readonly Session[]): StretchAndFlowRatioBreakdown

export interface StretchAndFlowCueAdherence {
  /** cue id -> share of Stretch sessions where it was checked. */
  shareByCueId: Record<string, number>
  sessionCount: number
}
export function stretchAndFlowCueAdherence(sessions: readonly Session[]): StretchAndFlowCueAdherence

export interface StretchAndFlowStepCompletion {
  /** step id -> number of sessions where it was completed. */
  completedCountByStepId: Record<string, number>
  sessionCount: number
}
export function stretchAndFlowStepCompletion(sessions: readonly Session[]): StretchAndFlowStepCompletion

export interface StretchAndFlowCarryoverProgress {
  /** distinct catalog item ids practiced, across all sessions. */
  practicedItemIds: string[]
  /** catalog item id -> session count. */
  countByItemId: Record<string, number>
  /** kind -> distinct items practiced. */
  distinctByKind: Record<StretchAndFlowCarryoverKind, number>
}
export function stretchAndFlowCarryoverProgress(sessions: readonly Session[]): StretchAndFlowCarryoverProgress

/** Highest breath count reached per session, oldest first, for a trend line. */
export function stretchAndFlowBreathCountTrend(sessions: readonly Session[]): { occurredAt: string; breathCount: number | null }[]
```

Extend `ProtocolHighlights` ([`shared/metrics.ts:288-303`](../../shared/metrics.ts:288)) with:

```ts
  stretchAndFlowMinutes: number
  stretchAndFlowSessionCount: number
  averageStretchAndFlowBreathCount: number | null
  stretchAndFlowCueAdherence: number | null   // mean share across cues
  stretchAndFlowCarryoverItemCount: number    // distinct catalog items practiced
```

`currentStretchAndFlowPhase` ([`shared/metrics.ts:398`](../../shared/metrics.ts:398)) stays as-is for backward compatibility. `stretchAndFlowPhaseChangeCount` ([`shared/metrics.ts:371-379`](../../shared/metrics.ts:371)) now counts changes between recorded stages — including the Air Only foundation — rather than only phase numbers (N4). The timeline function supersedes both for richer views but does not replace them.

---

## 6. Validation and persistence

### 6.1 `server/schemas.ts`

Add zod schemas mirroring §3.2. Follow the file's existing rule: **no `.default()`** ([`server/schemas.ts:5-6`](../../server/schemas.ts:5)).

```ts
const stretchAndFlowStepProgressSchema = z.object({
  stepId: z.enum(STRETCH_AND_FLOW_STEP_IDS),
  completed: z.boolean(),
  breathCount: z.number().int().min(0).max(100).nullable(),
})

const stretchAndFlowCarryoverLogSchema = z.object({
  kind: z.enum(STRETCH_AND_FLOW_CARRYOVER_KINDS).nullable(),
  itemIds: z.array(z.enum(STRETCH_AND_FLOW_CARRYOVER_IDS)).max(50),
  customText: z.string().max(2_000),
})

const stretchAndFlowDetailSchema = z.object({
  stageId: z.enum(STRETCH_AND_FLOW_STAGE_IDS).nullable(),
  ratio: z.enum(STRETCH_AND_FLOW_RATIOS).nullable(),
  usedTissue: z.boolean().nullable(),
  steps: z.array(stretchAndFlowStepProgressSchema).max(10),
  cuesChecked: z.array(z.enum(STRETCH_AND_FLOW_CUE_IDS)).max(20),
  toggledAirOnlyAndVoiced: z.boolean().nullable(),
  carryover: stretchAndFlowCarryoverLogSchema.nullable(),
})
```

Ids are validated against the catalog (`z.enum` over the id tuples in `shared/protocol.ts`), and a `superRefine` on `sessionSegmentInputSchema` enforces ratio↔stage and phaseNumber↔stageId consistency (spec §4.3): when `stageId` is set, `ratio` must equal the stage's ratio and `phaseNumber` must equal the stage's phase number. Legacy rows (`stageId: null`) are exempt from the stage match, so stored values keep loading — but a legacy row must not carry a `ratio` either, since a ratio with no stage is contradictory and would still be counted in the ratio breakdown (N5). A non-null `ratio` with `stageId: null` is rejected.

Add to `sessionSegmentInputSchema` ([`server/schemas.ts:15-35`](../../server/schemas.ts:15)):

```ts
  // Optional so a stale client that predates the field is not rejected; the
  // route normalizes a missing key to null (spec 3.3).
  stretchAndFlow: stretchAndFlowDetailSchema.nullable().optional(),
```

`phaseNumber` validation ([`server/schemas.ts:29`](../../server/schemas.ts:29)) is **unchanged** (still `1..MAX_STRETCH_AND_FLOW_PHASE`) per §4.2.

### 6.2 Persistence impact — `server/repositories.ts`

Sessions are stored as whole encrypted JSON blobs ([`server/repositories.ts:76-124`](../../server/repositories.ts:76)). **New fields persist automatically** once the schema accepts them and the client sends them — there is no column, no migration, and no backfill. The only repository change is the read-time normalization from §3.3, applied in `listAll` and `get`.

`ProtocolDocumentRepository` ([`server/repositories.ts:126-152`](../../server/repositories.ts:126)) is unchanged; the embedded protocol content lives in code, not in the free-text documents.

### 6.3 Security / privacy note

The new fields are health data (speech-therapy protocol detail). They stay inside the existing encrypted session blob and inherit its protections. They must **not** be added to analytics events, and the CSV/report exports are already documented as plaintext ([`client/screens/ReportScreen.tsx:93-96`](../../client/screens/ReportScreen.tsx:93)). No new audit surface is required; the existing export audit ([`server/repositories.ts:154-175`](../../server/repositories.ts:154)) already covers report/CSV generation.

---

## 7. UI plan, section by section

### 7.1 SessionEditor — Stretch step ([`client/screens/SessionEditor.tsx:391-425`](../../client/screens/SessionEditor.tsx:391))

Replace the current Phase number field + single slider with a guided flow:

1. **Stage selector** — a native radio group of the canonical stages (Air Only, Phase 1–4) from `STRETCH_AND_FLOW_STAGES`. Selecting a stage sets `stageId`, `phaseNumber` (for numbered stages), and `ratio`. A stored phase > 4 renders as a disabled radio labelled "Phase N (not in the current handout)".
2. **Ratio + tissue summary** — read-only text derived from the stage ("20% sound / 80% air · tissue: still with tissue"). For Phase 2/3, show "steps not printed in the handout" instead of inventing content.
3. **Step checklist** — one row per `STRETCH_AND_FLOW_STEPS` entry, each with a checkbox (`completed`) and a breath-count number input (`breathCount`), pre-filled with the step's count range as a hint. For stages with `stepsNotPrinted`, show the guidance text instead of the checklist.
4. **Cue checklist** — checkboxes for `STRETCH_AND_FLOW_CUES`, bound to `cuesChecked`.
5. **Pacing/safety callout** — render `STRETCH_AND_FLOW_PACING` as a visible list (not a tooltip), including the dizziness tip.
6. **Phase 4 toggle** — when `stageId === 'phase4'`, show a checkbox for `toggledAirOnlyAndVoiced`.
7. **Carryover** — a kind selector plus a multi-select of catalog items for that kind, and a free-text field for `customText` (daily phrases / how-to / conversation topics).
8. **Coordination slider** — keep the existing `coordinationRating` slider ([`client/screens/SessionEditor.tsx:409-414`](../../client/screens/SessionEditor.tsx:409)) unchanged.
9. **Notes** — keep the existing notes field.

### 7.2 TodayScreen ([`client/screens/TodayScreen.tsx:43-54`](../../client/screens/TodayScreen.tsx:43))

- Show today's stage name and ratio, not just the integer.
- Add a compact "today's checklist" derived from the most recent session's stage: steps completed / total, cues checked / total.
- Keep the link to the plan.

### 7.3 InsightsScreen ([`client/screens/InsightsScreen.tsx:198-207`](../../client/screens/InsightsScreen.tsx:198))

Expand the Stretch and Flow section:

- **Phase timeline** — a horizontal timeline of `stretchAndFlowPhaseTimeline` spans (stage label + date range + minutes). No color-only encoding: each span carries a text label.
- **Ratio breakdown** — minutes per ratio as a labelled list/bar.
- **Breath-count trend** — `TrendLineChart` over `stretchAndFlowBreathCountTrend`.
- **Cue adherence** — share per cue as a labelled list.
- **Carryover progress** — distinct items practiced by kind, plus a coverage count against the catalog size.
- Keep the existing average coordination line.

### 7.4 SessionDetailScreen ([`client/screens/SessionDetailScreen.tsx:96-97`](../../client/screens/SessionDetailScreen.tsx:96))

Add rows to the measure list: stage label, ratio, tissue used, steps completed (n/5), breath counts, cues checked, toggle (Phase 4), and carryover items (resolved to catalog text).

### 7.5 ProtocolScreen ([`client/screens/ProtocolScreen.tsx`](../../client/screens/ProtocolScreen.tsx))

- Render the embedded protocol: stages, ratios, the 5-step shape, cues, pacing, and the full carryover catalog (words, sentences, paragraphs, activities) from `shared/protocol.ts`.
- Change the `protocolNotes` hint ([`client/screens/ProtocolScreen.tsx:11-13`](../../client/screens/ProtocolScreen.tsx:11)) so pasting the handout is **optional** ("the tracker now embeds the Stretch and Flow content; use this note for anything extra").
- Keep `phasePlan` free text for SLP-directed notes.

### 7.6 ReportScreen and CSV export

- **ReportScreen** ([`client/screens/ReportScreen.tsx:213-216`](../../client/screens/ReportScreen.tsx:213)): extend the Stretch and Flow paragraph with stage, ratio, breath-count average, cue adherence, and carryover coverage. Extend the per-session measure list ([`client/screens/ReportScreen.tsx:255-256`](../../client/screens/ReportScreen.tsx:255)) with the new fields.
- **Browser CSV** ([`client/screens/ReportScreen.tsx:303-349`](../../client/screens/ReportScreen.tsx:303)): add long-format rows for stage, ratio, tissue, breath count, cues checked, and carryover items.
- **Server CSV** ([`server/csvExport.ts:17-54`](../../server/csvExport.ts:17)): **append** new columns after the existing ones (never reorder — downstream mappings depend on position). Proposed additions: `Stretch and Flow Stage`, `Voicing Ratio`, `Tissue Used`, `Steps Completed`, `Max Breath Count`, `Cues Checked`, `Carryover Kind`, `Carryover Items`. Update `PART_COLUMN_COUNT` ([`server/csvExport.ts:56`](../../server/csvExport.ts:56)) accordingly.

---

## 8. Accessibility and inclusive design

This is a speech-therapy context; the repo's inclusive-software rules and WCAG 2.2 AA apply at minimum.

- **Semantic HTML before ARIA** (R5.3): use `<fieldset>`/`<legend>` for the step and cue checklists, native `<input type="checkbox">` and `<input type="number">`, and `<details>` for collapsible catalog sections. Do not build custom checkbox widgets.
- **Programmatic labels** (R5.6): every new input gets a `<label for>` or `aria-labelledby`; hints use `aria-describedby`. The step checklist's breath-count input must be labelled with both the step name and "breath count".
- **Target size** (R5.2, SC 2.5.8): interactive targets ≥ 24×24 CSS px; prefer 44×44 for the chip rows and checkboxes.
- **No color-only encoding** (R5.4, SC 1.4.1): stage/ratio/timeline spans carry text labels, not just color. Contrast ≥ 4.5:1 body, ≥ 3:1 UI.
- **Focus not obscured** (SC 2.4.11): the editor's sticky bar ([`client/screens/SessionEditor.tsx:147-159`](../../client/screens/SessionEditor.tsx:147)) must not cover focused checklist items; verify scroll-margin.
- **Reduced motion** (R5.5): any timeline/entrance animation gated on `prefers-reduced-motion: no-preference`.
- **Reading level** (R5.7): the dizziness/safety copy is critical safety text — keep it at or below 6th grade and render it visibly, not in a tooltip.
- **Error messages** (R7.4): validation failures say what to fix without blame ("Enter a breath count between 1 and 10").
- **Keyboard** (R5.9): the full guided flow must be completable by keyboard with a visible focus indicator.
- **Screen reader** (R5.10): run axe-core in CI and test the editor with at least one screen reader before shipping.
- **Privacy** (R9.4): the new fields are health data; keep them in the encrypted blob, out of analytics, and out of any third-party SDK.

---

## 9. Backward compatibility and migration

- **No database migration.** Sessions are opaque encrypted blobs; new fields ride along automatically (§6.2).
- **Read-time normalization** (§3.3) fills `stretchAndFlow: null` for legacy rows so downstream code never sees `undefined`.
- **`phaseNumber` tolerance** (§4.2): stored values > 4 remain valid and loadable; the UI shows them read-only.
- **CSV columns are appended, never reordered** (§7.6) to protect downstream clinical mappings.
- **Existing metrics unchanged**: `currentStretchAndFlowPhase`, `stretchAndFlowPhaseChangeCount`, and `averageCoordination` keep their current behavior; new metrics are additive.
- **Rollback**: because nothing is migrated and the new field is optional, reverting the code leaves stored sessions readable by the old code (the extra key is ignored). This is a two-way door.

---

## 10. Test plan

### 10.1 Existing tests that change

| Test file | Change |
|---|---|
| [`test/metrics.test.ts:197-233`](../../test/metrics.test.ts:197) | `protocolHighlights` gains new fields; existing assertions stay valid, add assertions for the new ones. |
| [`test/csv.test.ts:155-193`](../../test/csv.test.ts:155) | The appended columns are checked at fixed positions: the legacy header keeps indices 0–35 and the eight new columns start at index 36. |
| [`test/api.test.ts:238-263`](../../test/api.test.ts:238) | Session round-trip should include a `stretchAndFlow` object; add a rejection test for an invalid ratio. |

### 10.2 New unit tests

- **Schema** (`test/api.test.ts` or a new `test/schemas.test.ts`): accepts a full `StretchAndFlowDetail`; rejects an unknown `ratio`; rejects `breathCount` out of range; accepts `stretchAndFlow: null`; accepts a legacy segment with the key absent (normalization).
- **Metrics** (`test/metrics.test.ts`): `stretchAndFlowPhaseTimeline` produces correct spans and minutes; `stretchAndFlowRatioBreakdown`; `stretchAndFlowCueAdherence`; `stretchAndFlowStepCompletion`; `stretchAndFlowCarryoverProgress` counts distinct items; `stretchAndFlowBreathCountTrend`; drafts are ignored (consistent with [`shared/metrics.ts:72-75`](../../shared/metrics.ts:72)).
- **Protocol integrity**: every `stepId` referenced by a stage exists in `STRETCH_AND_FLOW_STEPS`; every carryover `itemId` is unique; the canonical phase set is exactly 1–4.

### 10.3 New UI tests

- **SessionEditor**: selecting a stage sets ratio and phase; Phase 2/3 show "steps not printed"; Phase 4 shows the toggle; cue checklist persists; carryover selection persists; keyboard-only completion.
- **TodayScreen**: shows today's stage and checklist progress.
- **InsightsScreen**: renders the phase timeline, ratio breakdown, breath-count trend, cue adherence, and carryover progress with text labels (no color-only).
- **Accessibility**: axe-core passes on the editor, Today, and Insights; manual screen-reader pass on the editor.

---

## 11. Ordered implementation checklist

Small, reviewable stories. Contracts first (RRF: contracts before concurrency), then data, then UI, then export.

1. **Protocol content** — add `STRETCH_AND_FLOW_CUES`, `STRETCH_AND_FLOW_STEPS`, `STRETCH_AND_FLOW_STAGES`, `STRETCH_AND_FLOW_CARRYOVER`, `STRETCH_AND_FLOW_PACING`, and the canonical phase constants to `shared/protocol.ts`; add a protocol-integrity unit test.
2. **Data model** — add the §3.2 types and `stretchAndFlow` field to `shared/model.ts`; add `normalizeSegmentInput`; update `createEmptySegmentInput`.
3. **Validation** — add the §6.1 zod schemas to `server/schemas.ts`; add schema unit tests.
4. **Persistence normalization** — apply `normalizeSegmentInput` in `SessionRepository.listAll`/`get`; add a legacy-row round-trip test.
5. **Metrics** — add the §5 functions and extend `ProtocolHighlights`; add unit tests.
6. **SessionEditor** — guided stage selector, step checklist, cue checklist, pacing callout, Phase 4 toggle, carryover inputs; keep coordination slider and notes.
7. **SessionDetailScreen** — render the new fields.
8. **TodayScreen** — today's stage + checklist progress.
9. **InsightsScreen** — phase timeline, ratio breakdown, breath-count trend, cue adherence, carryover progress.
10. **ProtocolScreen** — render embedded content; soften the paste hint.
11. **ReportScreen + browser CSV** — extend the report paragraph, per-session list, and long-format rows.
12. **Server CSV** — append the new columns; update `PART_COLUMN_COUNT`; update `test/csv.test.ts`.
13. **Accessibility pass** — axe-core in CI, screen-reader pass, contrast/target-size checks on the new UI.
14. **Reconcile PDF** — if a full extractor becomes available, re-run §0 and update §2 (Phase 2 steps, Phase 3 ratio, true page count).

Deploy ≠ launch: ship behind the existing app (no feature flag infrastructure exists in this repo); the new fields are additive and dormant until the editor writes them, so old sessions are unaffected.

---

## Appendix A — Decision record

- **ADR-0001** — Stretch and Flow phase model (canonical 4 phases, tolerant storage). See [`docs/specs/adr-0001-stretch-and-flow-phase-model.md`](adr-0001-stretch-and-flow-phase-model.md).
- **Decision (inline, §3.1)** — structured `stretchAndFlow` object over additional flat fields. Rationale recorded in §3.1; not escalated to a separate ADR because it is a two-way door (the field is optional and additive).
