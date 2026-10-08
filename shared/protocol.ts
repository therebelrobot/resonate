/**
 * The practice protocol this app tracks, transcribed from the plan handed out by
 * the speech-language pathologist.
 *
 * It is the single source of truth for both the server (which seeds the default
 * tags from it) and the client (targets, prompts, the Plan screen), so the numbers
 * in the plan and the numbers in the charts cannot drift apart.
 *
 * Spelling in the original notes has been normalized - "diphragmatic" is written
 * "diaphragmatic", "taht" is "that". The embedded Stretch and Flow content is
 * transcribed from the handout; anything the handout does not print is marked as
 * such rather than invented.
 */

export const PRACTICE_TRACKS = ['vocalFunction', 'stretchAndFlow', 'endurance'] as const
export type PracticeTrack = (typeof PRACTICE_TRACKS)[number]

export const SEGMENT_KINDS = [
  'warmupNote',
  'glides',
  'powerAscending',
  'powerDescending',
  'stretchAndFlow',
  'endurance',
] as const
export type SegmentKind = (typeof SEGMENT_KINDS)[number]

/** Which track a part of a session counts toward. */
export const SEGMENT_TRACK: Record<SegmentKind, PracticeTrack> = {
  warmupNote: 'vocalFunction',
  glides: 'vocalFunction',
  powerAscending: 'vocalFunction',
  powerDescending: 'vocalFunction',
  stretchAndFlow: 'stretchAndFlow',
  endurance: 'endurance',
}

export interface SegmentDefinition {
  kind: SegmentKind
  label: string
  summary: string
  stepTitle: string
  guidance: readonly string[]
}

export const SEGMENT_DEFINITIONS: Record<SegmentKind, SegmentDefinition> = {
  warmupNote: {
    kind: 'warmupNote',
    label: 'Warm-up note',
    summary: '"eee", 2-3 times on a comfortable high note.',
    stepTitle: 'Warm-up note',
    guidance: ['Warm your voice up on a comfortable high note.', 'Listen and look for clear vibration without voice breaks.'],
  },
  glides: {
    kind: 'glides',
    label: 'Glides',
    summary: 'Slow and steady, mountain or valley. The biggest block of the session.',
    stepTitle: 'Glides',
    guidance: [
      'Spend the most time here.',
      'Mostly slow and steady glides, that can be mountains or valleys.',
      'Vary the speed and the configuration.',
      'Try "ole" or "ooh". Humming or "eee" work too.',
      'Pay attention to where you shift registers.',
    ],
  },
  powerAscending: {
    kind: 'powerAscending',
    label: 'POWER - up',
    summary: 'Low to high in steps, breathing between each one.',
    stepTitle: 'POWER - up',
    guidance: [
      'Start at a low note and sustain for 5-8 seconds.',
      'Breathe between each step.',
      'Continue up your range and stop at a comfortable high note, 5-8 notes in.',
    ],
  },
  powerDescending: {
    kind: 'powerDescending',
    label: 'POWER - down',
    summary: 'High to low, the same steps in the other direction.',
    stepTitle: 'POWER - down',
    guidance: [
      'The same steps as POWER - up, starting from the top and working down.',
      'Doing it in this direction helps identify your comfortable speaking range.',
    ],
  },
  stretchAndFlow: {
    kind: 'stretchAndFlow',
    label: 'Stretch and Flow',
    summary: 'Five to ten minutes on whichever phase you are on.',
    stepTitle: 'Stretch and Flow',
    guidance: [
      'Start with the Air Only foundation, then work through Phase 1 to Phase 4.',
      'Each stage has its own voicing ratio and a five-step shape; the Stretch step shows them.',
      'Whatever stage you are on is the one to practice.',
      'Ask your SLP at the next session what moves you to the next phase.',
    ],
  },
  endurance: {
    kind: 'endurance',
    label: 'Endurance',
    summary: 'Read aloud, or record a summary.',
    stepTitle: 'Endurance',
    guidance: [
      'Record a summary of your daily Star Trek episode.',
      'Read a portion of your cozy novel aloud.',
      'Either one counts today; the hour is the long game.',
    ],
  },
}

export interface TrackDefinition {
  track: PracticeTrack
  label: string
  shortLabel: string
  summary: string
  /** The plan's floor for a single session, in minutes. */
  sessionMinutesMinimum: number
  /** What to aim for, in minutes. */
  sessionMinutesTarget: number
  /** The plan's ceiling for a single session, in minutes, or null when there is none. */
  sessionMinutesMaximum: number | null
  /** Days per week the plan asks for, at minimum and at most. */
  daysPerWeekMinimum: number
  daysPerWeekMaximum: number
  /**
   * Minutes of this track that make one day count toward the weekly day target.
   * This is the plan's own per-session floor, except for endurance: the plan says
   * any amount counts there for now, so a single minute is enough.
   */
  dayCountsAtMinutes: number
  cadenceNote: string
  goalNote: string | null
  guidance: readonly string[]
}

export const TRACK_DEFINITIONS: Record<PracticeTrack, TrackDefinition> = {
  vocalFunction: {
    track: 'vocalFunction',
    label: 'Vocal Function Exercises',
    shortLabel: 'VFE',
    summary: 'Warm-up note, glides, then POWER steps.',
    sessionMinutesMinimum: 5,
    sessionMinutesTarget: 10,
    sessionMinutesMaximum: 15,
    daysPerWeekMinimum: 5,
    daysPerWeekMaximum: 7,
    dayCountsAtMinutes: 5,
    cadenceNote: 'Aim for 5-15 minutes, 5-7 days a week.',
    goalNote: null,
    guidance: [
      'Can be completed as a warm-up, a cool-down, or both.',
      'Warm-up note: "eee", 2-3 times on a comfortable high note. Listen for clear vibration without voice breaks.',
      'Glides: spend the most time here, mostly slow and steady, mountains or valleys, varying the speed and configuration.',
      'POWER: start at a low note, sustain 5-8 seconds, breathe between each step, and stop at a comfortable high note after 5-8 notes.',
      'You can run the same steps from high to low to identify a comfortable speaking range.',
    ],
  },
  stretchAndFlow: {
    track: 'stretchAndFlow',
    label: 'Stretch and Flow',
    shortLabel: 'Stretch',
    summary: 'Five to ten minutes a day, whatever phase you are on.',
    sessionMinutesMinimum: 5,
    sessionMinutesTarget: 8,
    sessionMinutesMaximum: 10,
    daysPerWeekMinimum: 5,
    daysPerWeekMaximum: 7,
    dayCountsAtMinutes: 5,
    cadenceNote: 'Practice for 5-10 minutes a day.',
    goalNote: null,
    guidance: [
      'Start with the Air Only foundation, then work through Phase 1 to Phase 4.',
      'Practice whichever stage you are on.',
      'Your SLP will say what moves you to the next stage.',
    ],
  },
  endurance: {
    track: 'endurance',
    label: 'Endurance practice',
    shortLabel: 'Endurance',
    summary: 'Reading or recording aloud, daily, building toward an hour.',
    sessionMinutesMinimum: 5,
    sessionMinutesTarget: 60,
    sessionMinutesMaximum: null,
    daysPerWeekMinimum: 7,
    daysPerWeekMaximum: 7,
    dayCountsAtMinutes: 1,
    cadenceNote: 'Every day. The goal is about an hour; for now, either one counts.',
    goalNote: 'The ultimate goal is about 1 hour a day.',
    guidance: [
      'Record a summary of your daily Star Trek episode.',
      'Read a portion of your cozy novel aloud.',
      'Either one counts today. The hour is the long game.',
    ],
  },
}

/**
 * The plan asks for glides to get the most time, so the insights screen measures
 * glide minutes as a share of VFE minutes and whether glides were the longest part.
 */
export const GLIDE_SEGMENT_KIND: SegmentKind = 'glides'

/** Session roles, matching "can be completed as a warm up and/or cool down". */
export const SESSION_ROLES = ['warmup', 'cooldown', 'warmupAndCooldown', 'standalone'] as const
export type SessionRole = (typeof SESSION_ROLES)[number]

export const SESSION_ROLE_LABELS: Record<SessionRole, string> = {
  warmup: 'Warm-up',
  cooldown: 'Cool-down',
  warmupAndCooldown: 'Warm-up and cool-down',
  standalone: 'On its own',
}

/** Stretch and Flow phase numbering starts here. */
export const FIRST_STRETCH_AND_FLOW_PHASE = 1

/**
 * Storage tolerance, not the canonical set. The handout defines four numbered
 * phases (see ADR-0001); this wide range keeps sessions stored before the
 * handout was modelled loadable. Do not tighten it - that would reject history.
 */
export const MAX_STRETCH_AND_FLOW_PHASE = 50

/** The canonical numbered-phase set from the handout (ADR-0001). */
export const LAST_STRETCH_AND_FLOW_PHASE = 4
export const STRETCH_AND_FLOW_PHASE_COUNT = 4

// ---------------------------------------------------------------------------
// Stretch and Flow protocol content, transcribed from the handout
// (docs/reference/Stretch & Flow.pdf, pages 7 and 9). Wording is preserved;
// only obvious line-wrap artifacts are joined. Anything the handout does not
// print is marked [not printed] and left null/empty rather than invented.
//
// TODO (spec 11.14): reconcile against the PDF if a full extractor becomes
// available. Still missing: the content of printed pages 1-6/8/10+, Phase 2's
// step sequence, and Phase 2/3's voicing ratios. (The file's true page count is
// known - 2 pages, spec 0 - so it is not listed here.)
//
// The ratio and carryover-kind unions live here (not in model.ts) because the
// stage and carryover-item types below need them, and model.ts already imports
// from this file. model.ts re-exports them, so `import { ... } from './model'`
// keeps working as the spec describes.
// ---------------------------------------------------------------------------

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

export const STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS: Record<StretchAndFlowCarryoverKind, string> = {
  rote: 'Rote tasks',
  singleWord: 'Single words',
  sentence: 'Sentences',
  paragraph: 'Paragraphs',
  dailyPhrase: 'Daily phrases',
  howToStory: 'How-to stories',
  conversation: 'Conversation',
}

/** Global cues (page 7, lines 4-6). */
export interface StretchAndFlowCue {
  id: string
  text: string
}

export const STRETCH_AND_FLOW_CUES: readonly StretchAndFlowCue[] = [
  { id: 'avoidPressedWhisper', text: 'Avoid pressed whisper' },
  { id: 'elongateVowels', text: 'Vowels elongated' },
  { id: 'roundLips', text: 'Lips can be rounded' },
]

/** One row of the fixed five-step exercise shape (page 7, lines 8-78). */
export interface StretchAndFlowStep {
  id: string
  label: string
  numbersPerBreath: number | null
  countRange: { min: number; max: number } | null
  elongateVowels: boolean
  /** First step only: blow the tissue this many times. The handout prints "5-7 times". */
  tissueBlows: { min: number; max: number } | null
}

export const STRETCH_AND_FLOW_STEPS: readonly StretchAndFlowStep[] = [
  {
    id: 'openThroat',
    label: 'Open throat on "oooo" vowel',
    numbersPerBreath: null,
    countRange: null,
    elongateVowels: false,
    tissueBlows: { min: 5, max: 7 },
  },
  {
    id: 'oneNumber',
    label: 'One number per breath',
    numbersPerBreath: 1,
    countRange: { min: 2, max: 10 },
    elongateVowels: true,
    tissueBlows: null,
  },
  {
    id: 'twoNumbers',
    label: 'Two numbers per breath',
    numbersPerBreath: 2,
    countRange: { min: 1, max: 10 },
    elongateVowels: true,
    tissueBlows: null,
  },
  {
    id: 'threeNumbers',
    label: 'Three numbers per breath',
    numbersPerBreath: 3,
    countRange: { min: 1, max: 9 },
    elongateVowels: false,
    tissueBlows: null,
  },
  {
    id: 'fiveNumbers',
    label: 'Five numbers per breath',
    numbersPerBreath: 5,
    countRange: { min: 1, max: 10 },
    elongateVowels: false,
    tissueBlows: null,
  },
]

/** Phase 3 progression guidance (page 7, lines 35-49). */
export const STRETCH_AND_FLOW_PHASE3_GUIDANCE: readonly string[] = [
  'Can do months of the year, days of the week in either Phase 1 or Phase 2 positions.',
  "If you haven't already, consider dropping the tissue as the visual feedback and allow the patient to rely on their motor memory.",
  'Carryover into an appropriate sounding voice that is not too breathy, but remains supported and open is key.',
  'Advance to single words that are not rote, phrases, paragraphs only if needed.',
  'Carrying this over into phrases that the patient uses daily, How-to stories that the patient recites (like how to build a snowman or how to make a sandwich) and then in conversational opportunities will be most applicable.',
]

/** Ordered stages: the Air Only foundation, then numbered Phase 1-4 (page 7). */
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

const ALL_STEP_IDS: readonly string[] = STRETCH_AND_FLOW_STEPS.map((step) => step.id)

export const STRETCH_AND_FLOW_STAGES: readonly StretchAndFlowStage[] = [
  {
    id: 'airOnly',
    label: 'Air Only',
    phaseNumber: null,
    ratio: 'airOnly',
    // The handout does not print a percentage for Air Only; this label is derived.
    ratioLabel: 'Air only',
    tissue: 'required',
    stepIds: ALL_STEP_IDS,
    guidance: [],
    stepsNotPrinted: false,
  },
  {
    id: 'phase1',
    label: 'Phase 1',
    phaseNumber: 1,
    ratio: 'twentyEighty',
    ratioLabel: '20% sound / 80% air',
    tissue: 'required',
    stepIds: ALL_STEP_IDS,
    guidance: [],
    stepsNotPrinted: false,
  },
  {
    id: 'phase2',
    label: 'Phase 2',
    phaseNumber: 2,
    // [not printed] - the handout prints the heading only.
    ratio: null,
    ratioLabel: null,
    tissue: 'unknown',
    stepIds: [],
    guidance: [],
    stepsNotPrinted: true,
  },
  {
    id: 'phase3',
    label: 'Phase 3',
    phaseNumber: 3,
    // [not printed] - Phase 3 is progression guidance, not a step list.
    ratio: null,
    ratioLabel: null,
    tissue: 'optional',
    stepIds: [],
    guidance: STRETCH_AND_FLOW_PHASE3_GUIDANCE,
    stepsNotPrinted: true,
  },
  {
    id: 'phase4',
    label: 'Phase 4',
    phaseNumber: 4,
    ratio: 'fiftyFifty',
    ratioLabel: '50% sound / 50% air',
    tissue: 'required',
    stepIds: ALL_STEP_IDS,
    guidance: [],
    stepsNotPrinted: false,
  },
]

/**
 * Pacing and safety (page 7, lines 51-80). Wording is verbatim; curly quotes in
 * the handout are normalized to straight quotes here.
 */
export const STRETCH_AND_FLOW_PACING: readonly { id: string; text: string }[] = [
  {
    id: 'toggleRationale',
    text: 'Remember, the idea is that the patient gets very good at toggling back and forth between the air only productions, and the voiced productions. Spend time either at the very beginning of introducing "air only" to the patient on the "ooo" vowel to toggle back and forth between these two phases without and then with voicing.',
  },
  { id: 'toggleInstruction', text: 'Toggle 1 & 2' },
  { id: 'goSlowly', text: 'Go SLOWLY!' },
  { id: 'catchBreath', text: 'Take time between productions to catch breath' },
  { id: 'preventDizziness', text: 'TIPS: This is to prevent dizziness' },
]

/** Carryover material catalog (page 9). */
export interface StretchAndFlowCarryoverItem {
  id: string
  kind: StretchAndFlowCarryoverKind
  text: string
}

export const STRETCH_AND_FLOW_CARRYOVER: readonly StretchAndFlowCarryoverItem[] = [
  // Rote tasks (lines 84-85)
  { id: 'daysOfWeek', kind: 'rote', text: 'Days of the week' },
  { id: 'monthsOfYear', kind: 'rote', text: 'Months of the year' },
  // Single words (lines 86-88), verbatim order
  { id: 'free', kind: 'singleWord', text: 'Free' },
  { id: 'fine', kind: 'singleWord', text: 'Fine' },
  { id: 'fun', kind: 'singleWord', text: 'Fun' },
  { id: 'hug', kind: 'singleWord', text: 'Hug' },
  { id: 'which', kind: 'singleWord', text: 'Which' },
  { id: 'how', kind: 'singleWord', text: 'How' },
  { id: 'hooray', kind: 'singleWord', text: 'Hooray' },
  { id: 'hear', kind: 'singleWord', text: 'Hear' },
  { id: 'where', kind: 'singleWord', text: 'Where' },
  { id: 'who', kind: 'singleWord', text: 'Who' },
  { id: 'frisk', kind: 'singleWord', text: 'Frisk' },
  { id: 'what', kind: 'singleWord', text: 'What' },
  { id: 'when', kind: 'singleWord', text: 'When' },
  { id: 'hoot', kind: 'singleWord', text: 'Hoot' },
  { id: 'flow', kind: 'singleWord', text: 'Flow' },
  { id: 'fool', kind: 'singleWord', text: 'Fool' },
  { id: 'friend', kind: 'singleWord', text: 'Friend' },
  { id: 'hand', kind: 'singleWord', text: 'Hand' },
  // Sentences (lines 90-102), verbatim
  { id: 'sentence1', kind: 'sentence', text: 'When Harold whistled a whimsical tune, white fairies arrived.' },
  { id: 'sentence2', kind: 'sentence', text: 'Houdini hankered for free funds.' },
  { id: 'sentence3', kind: 'sentence', text: 'Five white rabbits hid huddled beneath the hollows.' },
  { id: 'sentence4', kind: 'sentence', text: 'Our hill country used to be flat and empty.' },
  { id: 'sentence5', kind: 'sentence', text: 'Wine, cheese and sentiment are all we need for friends.' },
  { id: 'sentence6', kind: 'sentence', text: 'Five fine fantastic frogs whispered across the water.' },
  { id: 'sentence7', kind: 'sentence', text: 'Winter winds whipped while snow whirled around.' },
  // Paragraphs (lines 103-140), verbatim. "Whenver" is transcribed as printed.
  {
    id: 'wilber',
    kind: 'paragraph',
    text: 'Paragraph 3: "Wilber was a wimpy, wandering hog who wanted nothing more than to achieve the highest honor. He worked day and night while working two jobs on Ferdinand\'s farm. One fine, fair day, Wilber was hard at work on a hunt, when a hare hobbled into his way. With one leg hurt, the hare was hindered. Wilber offered a home to him and he healed."',
  },
  {
    id: 'wanda',
    kind: 'paragraph',
    text: 'Conversation Level, Paragraph 1: "In a blink of an eye, the weather can change for the worse. Just yesterday, Wanda was watching her wild children when suddenly a wind like she had never seen whipped her windows shut. With a worried look in her eyes, she gathered wee little Willie, Wendy and Walter and huddled them into the storm cellar. With wonder, all three followed their widowed mother. As the tornado passed and sirens wailed, all knew they were safe with each other."',
  },
  {
    id: 'henrietta',
    kind: 'paragraph',
    text: 'Conversation Level, Paragraph 2: "Who hasn\'t heard of Henrietta? Her favorite hosting past time was when hyenas hooted and hollered in the Sahara. Whenver and wherever she is able, Henrietta and her hindsight, have opened the door to here and there. High and low, her search wants to know, who loves hairstyles and hula hoops? I haven\'t the idea you seek, but honestly, who does?"',
  },
  // Carryover activities (lines 112-118)
  { id: 'dailyPhrases', kind: 'dailyPhrase', text: '10-15 phrases the patient uses daily' },
  { id: 'howToStories', kind: 'howToStory', text: 'How-To stories like how to load the laundry or how to brush teeth' },
  { id: 'perfectDay', kind: 'conversation', text: 'Describe your perfect day' },
  { id: 'jobDuties', kind: 'conversation', text: 'Describe your job duties' },
  { id: 'conversation', kind: 'conversation', text: 'Conversation about any topic the patient likes' },
]

/**
 * Stable id tuples, for schema validation. `z.enum` needs a literal tuple, so
 * these are declared explicitly; a protocol-integrity test asserts they stay in
 * sync with the object arrays above.
 */
export const STRETCH_AND_FLOW_STAGE_IDS = ['airOnly', 'phase1', 'phase2', 'phase3', 'phase4'] as const
export const STRETCH_AND_FLOW_STEP_IDS = ['openThroat', 'oneNumber', 'twoNumbers', 'threeNumbers', 'fiveNumbers'] as const
export const STRETCH_AND_FLOW_CUE_IDS = ['avoidPressedWhisper', 'elongateVowels', 'roundLips'] as const
export const STRETCH_AND_FLOW_CARRYOVER_IDS = [
  'daysOfWeek',
  'monthsOfYear',
  'free',
  'fine',
  'fun',
  'hug',
  'which',
  'how',
  'hooray',
  'hear',
  'where',
  'who',
  'frisk',
  'what',
  'when',
  'hoot',
  'flow',
  'fool',
  'friend',
  'hand',
  'sentence1',
  'sentence2',
  'sentence3',
  'sentence4',
  'sentence5',
  'sentence6',
  'sentence7',
  'wilber',
  'wanda',
  'henrietta',
  'dailyPhrases',
  'howToStories',
  'perfectDay',
  'jobDuties',
  'conversation',
] as const

/**
 * Display labels for the voicing ratios. Air Only's percentage is derived (the
 * handout does not print one), so it is labelled "Air only" rather than a
 * fabricated ratio.
 */
export const STRETCH_AND_FLOW_RATIO_LABELS: Record<StretchAndFlowRatio, string> = {
  airOnly: 'Air only',
  twentyEighty: '20% sound / 80% air',
  fiftyFifty: '50% sound / 50% air',
}

/**
 * The first step's tissue instruction depends on the stage (spec 2.3): Air Only
 * blows the tissue, Phase 1 and Phase 4 stay with it.
 */
export function stretchAndFlowStepLabel(step: StretchAndFlowStep, stage: StretchAndFlowStage | undefined): string {
  if (step.id !== 'openThroat') return step.label
  return stage?.id === 'airOnly'
    ? 'Open throat on "oooo" vowel, then blow the tissue 5-7 times'
    : 'Open throat on "oooo" vowel (still with tissue)'
}

/**
 * Display label for a timeline span id. Legacy spans use `legacy-phase-N`; a
 * phase within the canonical set was recorded before stages existed, a higher
 * one is not in the current handout (ADR-0001).
 */
export function stretchAndFlowStageLabel(stageId: string): string {
  const stage = STRETCH_AND_FLOW_STAGE_BY_ID.get(stageId)
  if (stage) return stage.label
  const legacyMatch = /^legacy-phase-(\d+)$/.exec(stageId)
  if (legacyMatch) {
    const phaseNumber = Number(legacyMatch[1])
    return phaseNumber <= LAST_STRETCH_AND_FLOW_PHASE
      ? `Phase ${phaseNumber} (recorded before stages)`
      : `Phase ${phaseNumber} (not in the current handout)`
  }
  return stageId
}

/** Lookup helpers so the UI does not re-scan the arrays on every render. */
export const STRETCH_AND_FLOW_STAGE_BY_ID: ReadonlyMap<string, StretchAndFlowStage> = new Map(
  STRETCH_AND_FLOW_STAGES.map((stage) => [stage.id, stage]),
)
export const STRETCH_AND_FLOW_STEP_BY_ID: ReadonlyMap<string, StretchAndFlowStep> = new Map(
  STRETCH_AND_FLOW_STEPS.map((step) => [step.id, step]),
)
export const STRETCH_AND_FLOW_CARRYOVER_BY_ID: ReadonlyMap<string, StretchAndFlowCarryoverItem> = new Map(
  STRETCH_AND_FLOW_CARRYOVER.map((item) => [item.id, item]),
)
export const STRETCH_AND_FLOW_CUE_BY_ID: ReadonlyMap<string, StretchAndFlowCue> = new Map(
  STRETCH_AND_FLOW_CUES.map((cue) => [cue.id, cue]),
)

/** The stage a stored phase number maps to, or undefined for legacy values > 4. */
export function stretchAndFlowStageForPhaseNumber(phaseNumber: number | null): StretchAndFlowStage | undefined {
  if (phaseNumber === null) return undefined
  return STRETCH_AND_FLOW_STAGES.find((stage) => stage.phaseNumber === phaseNumber)
}
