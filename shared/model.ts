import {
  SEGMENT_KINDS,
  type SegmentKind,
  type SessionRole,
  type StretchAndFlowCarryoverKind,
  type StretchAndFlowRatio,
} from './protocol'

// Plain types shared by the server and the client. Validation lives in
// server/schemas.ts so the client bundle does not carry the validator.

export { SESSION_ROLES, SESSION_ROLE_LABELS, type SessionRole } from './protocol'
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
  /** Phase 4 only: did the user toggle air-only and voiced productions. */
  toggledAirOnlyAndVoiced: boolean | null
  carryover: StretchAndFlowCarryoverLog | null
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
    paceRating: null,
    fatigueRating: null,
    tagIds: [],
    notes: '',
  }
}

/**
 * Legacy rows were stored before `stretchAndFlow` existed, so the key is simply
 * absent on read. This fills it with null so downstream code never sees
 * `undefined`. Read-time normalization, not a data migration (spec 3.3).
 */
export function normalizeSegmentInput(segment: SessionSegmentInput): SessionSegmentInput {
  return segment.stretchAndFlow === undefined ? { ...segment, stretchAndFlow: null } : segment
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

/** The parts a new session starts with: everything except the downward POWER pass. */
export const DEFAULT_SEGMENT_KINDS: readonly SegmentKind[] = [
  'warmupNote',
  'glides',
  'powerAscending',
  'stretchAndFlow',
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
