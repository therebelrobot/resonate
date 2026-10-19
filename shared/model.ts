import {
  SEGMENT_KINDS,
  type SegmentKind,
  type SessionRole,
  type StretchAndFlowCarryoverKind,
  type StretchAndFlowRatio,
} from './protocol'

// Plain types shared by the server and the client. Validation lives in
// server/schemas.ts so the client bundle does not carry the validator.

export { SESSION_ROLES, SESSION_ROLE_LABELS, type SessionRole, type SegmentKind } from './protocol'
// The ratio and carryover-kind unions are defined in protocol.ts (the stage and
// carryover-item types there need them) and re-exported here so the spec's
// `import { ... } from './model'` contract holds.
export {
  STRETCH_AND_FLOW_RATIOS,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  type StretchAndFlowRatio,
  type StretchAndFlowCarryoverKind,
} from './protocol'

export const TAG_KINDS = ['focus', 'win', 'watch', 'glideShape', 'utterance', 'material'] as const
export type TagKind = (typeof TAG_KINDS)[number]

export const TAG_KIND_LABELS: Record<TagKind, { singular: string; plural: string; prompt: string }> = {
  focus: { singular: 'Target', plural: 'Targets', prompt: 'What were you working on?' },
  win: { singular: 'Win', plural: 'Wins', prompt: 'What went well?' },
  watch: { singular: 'Watch item', plural: 'Watch items', prompt: 'Anything to flag for your SLP?' },
  glideShape: { singular: 'Glide shape', plural: 'Glide shapes', prompt: 'Shape and motion of the glides' },
  utterance: { singular: 'Utterance', plural: 'Utterances', prompt: 'What you phonated on' },
  material: { singular: 'Reading material', plural: 'Reading material', prompt: 'What you read or recorded' },
}

export interface Tag {
  id: string
  kind: TagKind
  name: string
  archived: boolean
  createdAt: string
}

export interface TagInput {
  kind: TagKind
  name: string
  archived: boolean
}

export const GLIDE_PACES = ['slow', 'mixed', 'fast'] as const
export type GlidePace = (typeof GLIDE_PACES)[number]

export const GLIDE_PACE_LABELS: Record<GlidePace, string> = {
  slow: 'Slow and steady',
  mixed: 'Mixed speeds',
  fast: 'Faster',
}

/** One row of the five-step shape, as actually performed. */
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
  /** Phase 1 and Phase 2: did the user toggle air-only and voiced productions (the handout's "Toggle 1 & 2"). */
  toggledAirOnlyAndVoiced: boolean | null
  carryover: StretchAndFlowCarryoverLog | null
}

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

export type SessionStatus = 'draft' | 'complete'

/**
 * One part of a session. Every field is always present; the ones a given part does
 * not use stay null, so the shape stays flat, the editor can render fields by
 * `kind`, and nothing depends on optional-key bookkeeping.
 */
export interface SessionSegmentInput {
  kind: SegmentKind
  seconds: number
  /** Warm-up note */
  repetitions: number | null
  clarityRating: number | null
  voiceBreaks: number | null
  /** Glides */
  glidePace: GlidePace | null
  registerShifts: number | null
  /** POWER, up and down */
  startNote: string
  topNote: string
  bottomNote: string
  notesClimbed: number | null
  longestSustainSeconds: number | null
  identifiedComfortableRange: boolean
  /** Stretch and Flow */
  phaseNumber: number | null
  coordinationRating: number | null
  /** Stretch and Flow - structured detail; null for other kinds and legacy rows. */
  stretchAndFlow: StretchAndFlowDetail | null
  /** Vocal Function - pitch work in Hz (glides and POWER); null for other kinds and legacy rows. */
  pitch: PitchWorkInput | null
  /** Resonance Practice - structured detail; null for other kinds and legacy rows. */
  resonance: ResonanceDetail | null
  /** Carry-Over Practice - structured detail; null for other kinds and legacy rows. */
  carryover: CarryoverDetail | null
  /** Endurance */
  paceRating: number | null
  fatigueRating: number | null
  /** Any part: glide shapes, utterances, and reading material all live here. */
  tagIds: string[]
  notes: string
}

export interface SessionInput {
  occurredAt: string
  status: SessionStatus
  role: SessionRole
  /** Vocal effort or strain walking in, 0-100. */
  effortBefore: number
  /** Vocal effort after the work, 0-100, or null while not yet rated. */
  effortAfter: number | null
  focusTagIds: string[]
  winTagIds: string[]
  watchTagIds: string[]
  /** Free text for the SLP. */
  slpNote: string
  segments: SessionSegmentInput[]
}

export interface Session extends SessionInput {
  id: string
  createdAt: string
  updatedAt: string
}

/**
 * A short audio recording captured inline while logging a session. The audio
 * bytes stay server-side (encrypted at rest); the client only ever sees this
 * metadata and streams the audio back through an authenticated endpoint.
 */
export interface Recording {
  id: string
  sessionId: string
  /** The step the recording belongs to, or null for a session-level recording. */
  segmentKind: SegmentKind | null
  /** A short human label, e.g. the step name or "Take 2". */
  label: string
  /** The browser's recording MIME type, e.g. "audio/webm;codecs=opus". */
  mimeType: string
  /** Duration in seconds, or null when the browser did not report one. */
  durationSeconds: number | null
  /** Size of the stored audio in bytes. */
  byteLength: number
  createdAt: string
}

/** Upper bound on one uploaded recording, enforced by the schema and the body limit. */
export const MAX_RECORDING_BYTES = 20 * 1024 * 1024
export const MAX_RECORDING_SECONDS = 60 * 60

/** A display label for a recording, falling back to its step when none was given. */
export function recordingDisplayLabel(recording: Recording): string {
  if (recording.label.trim() !== '') return recording.label.trim()
  return recording.segmentKind ? `Step: ${recording.segmentKind}` : 'Recording'
}

export interface VaultStatus {
  vaultInitialized: boolean
  unlocked: boolean
  totpEnabled: boolean
  sessionIdleMinutes: number
}

export interface AuditEvent {
  id: number
  at: string
  event: string
  ipAddress: string
  userAgent: string
}

export const PROTOCOL_DOCUMENT_IDS = ['protocolNotes', 'phasePlan'] as const
export type ProtocolDocumentId = (typeof PROTOCOL_DOCUMENT_IDS)[number]

export interface ProtocolDocument {
  id: ProtocolDocumentId
  text: string
  updatedAt: string | null
}

export function isProtocolDocumentId(value: string): value is ProtocolDocumentId {
  return (PROTOCOL_DOCUMENT_IDS as readonly string[]).includes(value)
}

export function createEmptySegmentInput(kind: SegmentKind): SessionSegmentInput {
  return {
    kind,
    seconds: 0,
    repetitions: null,
    clarityRating: null,
    voiceBreaks: null,
    glidePace: null,
    registerShifts: null,
    startNote: '',
    topNote: '',
    bottomNote: '',
    notesClimbed: null,
    longestSustainSeconds: null,
    identifiedComfortableRange: false,
    phaseNumber: null,
    coordinationRating: null,
    stretchAndFlow: null,
    pitch: null,
    resonance: null,
    carryover: null,
    paceRating: null,
    fatigueRating: null,
    tagIds: [],
    notes: '',
  }
}

/**
 * Legacy rows were stored before `stretchAndFlow` (and later `pitch`,
 * `resonance`, `carryover`) existed, so the keys are simply absent on read. This
 * fills them with null so downstream code never sees `undefined`. Read-time
 * normalization, not a data migration (spec 3.3).
 */
export function normalizeSegmentInput(segment: SessionSegmentInput): SessionSegmentInput {
  if (
    segment.stretchAndFlow !== undefined &&
    segment.pitch !== undefined &&
    segment.resonance !== undefined &&
    segment.carryover !== undefined
  ) {
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

/** The equal-temperament note names, A4 = 440 Hz. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/**
 * The note name nearest a frequency, in scientific pitch notation (A4 = 440 Hz).
 * Rounds to the nearest semitone, so a good-faith reading of "about 350" comes
 * out "F4". The stored value stays Hz; the name is derived, never stored
 * (ADR-0003).
 */
export function noteNameForHz(hz: number): string {
  const semitonesFromA4 = Math.round(12 * Math.log2(hz / 440))
  const noteIndex = ((((semitonesFromA4 + 9) % 12) + 12) % 12)
  const octave = 4 + Math.floor((semitonesFromA4 + 9) / 12)
  return `${NOTE_NAMES[noteIndex]}${octave}`
}

/** A blank Stretch and Flow detail, for the editor to start from. */
export function createEmptyStretchAndFlowDetail(): StretchAndFlowDetail {
  return {
    stageId: null,
    ratio: null,
    usedTissue: null,
    steps: [],
    cuesChecked: [],
    toggledAirOnlyAndVoiced: null,
    carryover: null,
  }
}

/** A blank pitch-work object, for the editor to start from. */
export function createEmptyPitchWork(): PitchWorkInput {
  return { highHz: null, lowHz: null, speakingRangeLowHz: null }
}

/** A blank Resonance detail, for the editor to start from. */
export function createEmptyResonanceDetail(): ResonanceDetail {
  return { steps: [], comfortablePitchHz: null, sentenceIds: [], intonationRepetitions: null }
}

/** A blank Carry-Over detail, for the editor to start from. */
export function createEmptyCarryoverDetail(): CarryoverDetail {
  return { conversationCount: null, contextIds: [], customContext: '', warmedUpBefore: null }
}

/** The breath-count field's accepted range, matching the schema (spec 6.1). */
export const STRETCH_AND_FLOW_BREATH_COUNT_MAX = 100

/**
 * Parses a breath-count field value. Out-of-range input is kept rather than
 * clamped, so the displayed value, the stored value, and the error state agree
 * (N1). Blank or non-numeric input means "not recorded" (null).
 */
export function parseBreathCountInput(text: string): { value: number | null; error: string | null } {
  if (text === '') return { value: null, error: null }
  const parsed = Number.parseInt(text, 10)
  if (!Number.isFinite(parsed)) return { value: null, error: null }
  if (parsed < 0 || parsed > STRETCH_AND_FLOW_BREATH_COUNT_MAX) {
    return { value: parsed, error: `Enter a breath count between 0 and ${STRETCH_AND_FLOW_BREATH_COUNT_MAX}.` }
  }
  return { value: parsed, error: null }
}

/**
 * The parts a new session starts with: everything except the downward POWER
 * pass and the Carry-Over practice. Both are opt-in in the editor, which matches
 * the plan: POWER - down is occasional, and Carry-Over is two conversations a
 * week rather than daily.
 */
export const DEFAULT_SEGMENT_KINDS: readonly SegmentKind[] = [
  'warmupNote',
  'glides',
  'powerAscending',
  'stretchAndFlow',
  'resonance',
  'endurance',
]

export function createEmptySessionInput(now: Date = new Date()): SessionInput {
  return {
    occurredAt: now.toISOString(),
    status: 'draft',
    role: 'warmup',
    effortBefore: 50,
    effortAfter: null,
    focusTagIds: [],
    winTagIds: [],
    watchTagIds: [],
    slpNote: '',
    segments: DEFAULT_SEGMENT_KINDS.map((kind) => createEmptySegmentInput(kind)),
  }
}

/** Keeps parts in protocol order so the editor and the detail view always agree. */
export function sortSegmentsByProtocolOrder(segments: readonly SessionSegmentInput[]): SessionSegmentInput[] {
  return [...segments].sort((left, right) => SEGMENT_KINDS.indexOf(left.kind) - SEGMENT_KINDS.indexOf(right.kind))
}

export function tagIdsOfKind(session: Session, tagKind: TagKind): string[] {
  if (tagKind === 'focus') return session.focusTagIds
  if (tagKind === 'win') return session.winTagIds
  if (tagKind === 'watch') return session.watchTagIds
  return session.segments.flatMap((segment) => segment.tagIds)
}
