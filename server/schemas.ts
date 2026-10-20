import { z } from 'zod'
import {
  GLIDE_PACES,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  STRETCH_AND_FLOW_BREATH_COUNT_MAX,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_RATIOS,
  TAG_KINDS,
} from '../shared/model'
import {
  CARRYOVER_CONTEXT_IDS,
  MAX_STRETCH_AND_FLOW_PHASE,
  RESONANCE_SENTENCE_IDS,
  RESONANCE_STEP_IDS,
  SEGMENT_KINDS,
  SESSION_ROLES,
  STRETCH_AND_FLOW_CARRYOVER_IDS,
  STRETCH_AND_FLOW_CUE_IDS,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  STRETCH_AND_FLOW_STAGE_IDS,
  STRETCH_AND_FLOW_STEP_IDS,
} from '../shared/protocol'

// Full-replacement schemas only (PUT, never PATCH), and no `.default()` anywhere:
// defaults on partial update schemas silently overwrite fields the client never sent.

const tagIdSchema = z.string().uuid()
const tagIdListSchema = z.array(tagIdSchema).max(40)
const longTextSchema = z.string().max(10_000)
const documentTextSchema = z.string().max(20_000)
const ratingSchema = z.number().int().min(0).max(100)
const noteAtomSchema = z.string().trim().max(60)

const stretchAndFlowStepProgressSchema = z.object({
  stepId: z.enum(STRETCH_AND_FLOW_STEP_IDS),
  completed: z.boolean(),
  breathCount: z.number().int().min(0).max(STRETCH_AND_FLOW_BREATH_COUNT_MAX).nullable(),
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

export const sessionSegmentInputSchema = z
  .object({
    kind: z.enum(SEGMENT_KINDS),
    seconds: z.number().int().min(0).max(24 * 3600),
    repetitions: z.number().int().min(0).max(20).nullable(),
    clarityRating: ratingSchema.nullable(),
    voiceBreaks: z.number().int().min(0).max(50).nullable(),
    glidePace: z.enum(GLIDE_PACES).nullable(),
    registerShifts: z.number().int().min(0).max(50).nullable(),
    startNote: noteAtomSchema,
    topNote: noteAtomSchema,
    bottomNote: noteAtomSchema,
    notesClimbed: z.number().int().min(0).max(40).nullable(),
    longestSustainSeconds: z.number().int().min(0).max(600).nullable(),
    identifiedComfortableRange: z.boolean(),
    phaseNumber: z.number().int().min(1).max(MAX_STRETCH_AND_FLOW_PHASE).nullable(),
    coordinationRating: ratingSchema.nullable(),
    // Optional so a stale client that predates the field is not rejected; the
    // route normalizes a missing key to null (spec 3.3). No `.default()` here.
    stretchAndFlow: stretchAndFlowDetailSchema.nullable().optional(),
    pitch: pitchWorkSchema.nullable().optional(),
    resonance: resonanceDetailSchema.nullable().optional(),
    carryover: carryoverDetailSchema.nullable().optional(),
    paceRating: ratingSchema.nullable(),
    fatigueRating: ratingSchema.nullable(),
    tagIds: tagIdListSchema,
    notes: longTextSchema,
  })
  .superRefine((segment, context) => {
    // Ratio and phase number are derived from the stage, never picked
    // independently (spec 4.3). A legacy row (stageId null) is exempt from the
    // stage match, but it must not carry a ratio either: a ratio with no stage
    // is contradictory and would still be counted in the ratio breakdown (N5).
    const detail = segment.stretchAndFlow
    if (!detail) return
    if (!detail.stageId) {
      if (detail.ratio !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stretchAndFlow', 'ratio'],
          message: 'A voicing ratio requires a selected stage.',
        })
      }
      return
    }
    const stage = STRETCH_AND_FLOW_STAGE_BY_ID.get(detail.stageId)
    if (!stage) return
    if (detail.ratio !== stage.ratio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stretchAndFlow', 'ratio'],
        message: 'The voicing ratio must match the selected stage.',
      })
    }
    if (segment.phaseNumber !== stage.phaseNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phaseNumber'],
        message: 'The phase number must match the selected stage.',
      })
    }
  })

export const sessionInputSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }),
  status: z.enum(['draft', 'complete']),
  role: z.enum(SESSION_ROLES),
  effortBefore: ratingSchema,
  effortAfter: ratingSchema.nullable(),
  focusTagIds: tagIdListSchema,
  winTagIds: tagIdListSchema,
  watchTagIds: tagIdListSchema,
  slpNote: longTextSchema,
  segments: z.array(sessionSegmentInputSchema).max(8),
})

/** base64 inflates by 4/3; leave a little headroom for padding and whitespace. */
const MAX_RECORDING_BASE64_LENGTH = Math.ceil(MAX_RECORDING_BYTES / 3) * 4 + 16

export const recordingInputSchema = z.object({
  segmentKind: z.enum(SEGMENT_KINDS).nullable(),
  label: z.string().trim().max(120),
  // Echoed back as the response Content-Type, so it must never be markup. The
  // audio type plus optional parameters, e.g. "audio/webm;codecs=opus".
  mimeType: z
    .string()
    .trim()
    .max(120)
    .regex(/^audio\/[a-z0-9.+-]+(?:\s*;\s*[a-z0-9=.+-]+)*$/i),
  durationSeconds: z.number().min(0).max(MAX_RECORDING_SECONDS).nullable(),
  audioBase64: z.string().min(1).max(MAX_RECORDING_BASE64_LENGTH),
})

export const tagInputSchema = z.object({
  kind: z.enum(TAG_KINDS),
  name: z.string().trim().min(1).max(60),
  archived: z.boolean(),
})

export const protocolDocumentInputSchema = z.object({
  text: documentTextSchema,
})

export const passphraseSchema = z.string().min(1).max(1024)

export const setupRequestSchema = z.object({
  setupToken: z.string().min(1).max(200),
  passphrase: passphraseSchema,
})

export const loginRequestSchema = z.object({
  passphrase: passphraseSchema,
  totpCode: z.string().max(12).optional(),
})

export const recoverRequestSchema = z.object({
  recoveryCode: z.string().min(1).max(200),
  newPassphrase: passphraseSchema,
})

export const changePassphraseRequestSchema = z.object({
  currentPassphrase: passphraseSchema,
  newPassphrase: passphraseSchema,
})

export const passphraseConfirmationSchema = z.object({
  passphrase: passphraseSchema,
})

export const totpConfirmRequestSchema = z.object({
  code: z.string().min(6).max(12),
})

export const clientExportAuditSchema = z.object({
  kind: z.enum(['report', 'session_csv', 'session_package']),
})
