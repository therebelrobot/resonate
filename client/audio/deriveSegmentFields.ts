import { CONFIDENCE_THRESHOLDS, FLAGS, type VoiceFrame } from 'sonorant-react'
import {
  createEmptyPitchWork,
  createEmptyResonanceDetail,
  noteNameForHz,
  stretchAndFlowStagePatch,
  type GlidePace,
  type ResonanceStepProgress,
  type SegmentKind,
  type SessionSegmentInput,
} from '../../shared/model'
import { STRETCH_AND_FLOW_STAGES } from '../../shared/protocol'

/**
 * Turns the frames the Sonorant core produced for one recorded step into the
 * editor fields that audio can speak to, ready to pre-fill on a tap.
 *
 * The division of labour is the Sonorant rule, kept here: the Rust core measures
 * (f0, confidence, formants, HNR/jitter/shimmer, flags); this module only reads
 * those measurements - counting runs, taking medians and extremes, mapping a rate
 * to a pace word. No acoustic maths of its own, and nothing is offered without the
 * confidence it was derived at, because a pre-filled number is still a claim about
 * the voice.
 *
 * Every threshold below is provisional in the same sense as the display-smoothing
 * defaults: chosen to behave sensibly on speech, not taken from a clinical source.
 * Validate them against real sessions before treating them as settled.
 */

/** A pitch reading below this confidence is not used at all (TDD display bands). */
export const PITCH_CONFIDENCE_FLOOR = CONFIDENCE_THRESHOLDS.medium
const PITCH_MIN_HZ = 60
const PITCH_MAX_HZ = 1_200
/** Below this the clip is treated as silence rather than air-only voicing. */
const SILENCE_DBFS = -45
const EXCLUDED_PITCH_FLAGS = FLAGS.CLIPPED | FLAGS.LOW_SNR
/** The core's default hop is 512 samples; this is only a fallback for one frame. */
const DEFAULT_HOP_MS = (512 / 44_100) * 1_000
/** A dropout shorter than this is a frame hiccup, not the end of a note. */
const GAP_TOLERANCE_MS = 120
const MIN_RUN_MS = 200
const MIN_SUSTAINED_RUN_MS = 400
const MIN_PITCH_FRAMES = 8
/** Voiced time, in ms, at which coverage and the pitch confidence reach full weight. */
const FULL_COVERAGE_MS = 2_000
/** Meter reference for converting Hz to semitone distance (a unit change, not a measurement). */
const A4_HZ = 440

const GLIDE_SLOW_MAX_SEMITONES_PER_SECOND = 3.5
const GLIDE_FAST_MIN_SEMITONES_PER_SECOND = 8
const REGISTER_SHIFT_SEMITONES = 4
const VOICE_BREAK_SEMITONES = 7
const VOICE_BREAK_MAX_GAP_MS = 800
const NOTE_MERGE_SEMITONES = 1
const NOTE_MERGE_MAX_GAP_MS = 1_500
const CONTOUR_SEMITONES = 3
/** The share of audible frames that carry voicing decides the Stretch and Flow phase. */
const AIR_ONLY_MAX_VOICED_FRACTION = 0.1
const PHASE_THREE_MIN_VOICED_FRACTION = 0.35

// Mirrors the ceilings in server/schemas.ts. A derived count is clamped to the
// field's own maximum so an accepted reading can always be saved.
const MAX_VOICE_BREAKS = 50
const MAX_REGISTER_SHIFTS = 50
const MAX_INTONATION_REPETITIONS = 100

export type SuggestionField =
  | 'seconds'
  | 'repetitions'
  | 'clarityRating'
  | 'voiceBreaks'
  | 'glidePace'
  | 'registerShifts'
  | 'startNote'
  | 'topNote'
  | 'bottomNote'
  | 'notesClimbed'
  | 'longestSustainSeconds'
  | 'identifiedComfortableRange'
  | 'pitch.highHz'
  | 'pitch.lowHz'
  | 'pitch.speakingRangeLowHz'
  | 'resonance.comfortablePitchHz'
  | 'resonance.intonationRepetitions'
  | 'resonance.steps'
  | 'stretchAndFlow.stage'
  | 'coordinationRating'
  | 'paceRating'
  | 'fatigueRating'

export interface SegmentSuggestion {
  field: SuggestionField
  /** The editor field's own label, so a suggestion reads as the field it fills. */
  label: string
  /** The value as the editor would show it. */
  displayValue: string
  /** 0..1. Nothing is offered without one. */
  confidence: number
  /** How it was measured, short enough for a line under the value. */
  method: string
  /** What to weigh before accepting, when the inference is not the field's whole story. */
  caveat?: string
  /** The change to apply. A function so it can fold in what is already on the segment. */
  apply: (segment: SessionSegmentInput) => Partial<SessionSegmentInput>
}

export interface SegmentSuggestions {
  kind: SegmentKind
  /** Frames the core produced for the analysed window. */
  frameCount: number
  /** Of those, the frames trusted as voiced pitch. */
  voicedFrameCount: number
  /** Seconds of audio actually analysed (the clip may be longer). */
  analyzedSeconds: number
  /** True when the clip was longer than the analysis cap and only a prefix was read. */
  truncated: boolean
  suggestions: SegmentSuggestion[]
}

export interface DeriveInput {
  kind: SegmentKind
  frames: readonly VoiceFrame[]
  /** The clip's length as the browser reported it, or null. */
  durationSeconds: number | null
  /** True when the audio was capped and only a prefix was analysed. */
  truncated?: boolean
  /** Seconds of audio actually analysed. */
  analyzedSeconds?: number
}

interface VoicedRun {
  frames: VoiceFrame[]
  startMs: number
  endMs: number
}

interface Derivation {
  kind: SegmentKind
  frames: readonly VoiceFrame[]
  /** Trusted voiced pitch frames. */
  voiced: VoiceFrame[]
  /** Voiced frames without a subharmonic flag - the reliable extremes. */
  clean: VoiceFrame[]
  /** Frames loud enough to be an attempt at sound, voiced or not. */
  audible: VoiceFrame[]
  hopMs: number
  /** Voiced time as a fraction of a 2 s reference, clamped to 1. */
  coverage: number
  /** Voicing as a fraction of the audible frames. */
  voicedFraction: number
  /** Sustained voiced runs, the basis for holds, steps, and counts. */
  runs: VoicedRun[]
  meanF0Confidence: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isVoiced(frame: VoiceFrame): boolean {
  return (
    Number.isFinite(frame.f0_hz) &&
    frame.f0_hz >= PITCH_MIN_HZ &&
    frame.f0_hz <= PITCH_MAX_HZ &&
    frame.f0_confidence >= PITCH_CONFIDENCE_FLOOR &&
    (frame.flags & EXCLUDED_PITCH_FLAGS) === 0
  )
}

function isAudible(frame: VoiceFrame): boolean {
  return typeof frame.rms_dbfs === 'number' && Number.isFinite(frame.rms_dbfs) && frame.rms_dbfs > SILENCE_DBFS
}

/** Hz as semitones from A4, so pitch distances are in the musical unit. */
function hzToSemitones(hz: number): number {
  return 12 * Math.log2(hz / A4_HZ)
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** The value at `fraction` through the sorted list (0 = min, 1 = max). */
function quantile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]!
  return sorted[lower]! * (1 - (position - lower)) + sorted[upper]! * (position - lower)
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function standardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const average = mean(values)!
  return Math.sqrt(values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length)
}

function frameHopMs(frames: readonly VoiceFrame[]): number {
  const deltas: number[] = []
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index]!.t_ms - frames[index - 1]!.t_ms
    if (delta > 0) deltas.push(delta)
  }
  return median(deltas) ?? DEFAULT_HOP_MS
}

/**
 * Contiguous voiced runs. A gap shorter than the tolerance keeps a run alive, so a
 * one-frame dropout inside a held note does not read as two notes.
 */
function voicedRuns(
  frames: readonly VoiceFrame[],
  hopMs: number,
  { gapToleranceMs = GAP_TOLERANCE_MS, minRunMs = MIN_RUN_MS }: { gapToleranceMs?: number; minRunMs?: number } = {},
): VoicedRun[] {
  const runs: VoicedRun[] = []
  let current: VoicedRun | null = null
  for (const frame of frames) {
    if (!isVoiced(frame)) continue
    if (current && frame.t_ms - current.endMs <= gapToleranceMs) {
      current.frames.push(frame)
      current.endMs = frame.t_ms
    } else {
      if (current) runs.push(current)
      current = { frames: [frame], startMs: frame.t_ms, endMs: frame.t_ms }
    }
  }
  if (current) runs.push(current)
  return runs.filter((run) => run.endMs - run.startMs + hopMs >= minRunMs)
}

function runDurationMs(run: VoicedRun, hopMs: number): number {
  return run.endMs - run.startMs + hopMs
}

function runCenterSemitones(run: VoicedRun): number {
  const mid = median(run.frames.map((frame) => hzToSemitones(frame.f0_hz)))
  return mid ?? hzToSemitones(run.frames[0]!.f0_hz)
}

/** The per-frame pitch velocity inside a run, in semitones per second. */
function runPitchVelocities(run: VoicedRun): number[] {
  const velocities: number[] = []
  for (let index = 1; index < run.frames.length; index += 1) {
    const previous = run.frames[index - 1]!
    const current = run.frames[index]!
    const deltaMs = current.t_ms - previous.t_ms
    if (deltaMs <= 0) continue
    const deltaSemitones = hzToSemitones(current.f0_hz) - hzToSemitones(previous.f0_hz)
    velocities.push(deltaSemitones / (deltaMs / 1_000))
  }
  return velocities
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatHz(hz: number): string {
  return `${Math.round(hz)} Hz (${noteNameForHz(hz)})`
}

/** Runs of constant note: neighbouring runs at nearly the same pitch are one step. */
function notePlateaus(runs: readonly VoicedRun[]): VoicedRun[][] {
  const plateaus: VoicedRun[][] = []
  for (const run of runs) {
    const previous = plateaus[plateaus.length - 1]
    const last = previous?.[previous.length - 1]
    if (
      previous &&
      last &&
      run.startMs - last.endMs <= NOTE_MERGE_MAX_GAP_MS &&
      Math.abs(runCenterSemitones(run) - runCenterSemitones(last)) <= NOTE_MERGE_SEMITONES
    ) {
      previous.push(run)
    } else {
      plateaus.push([run])
    }
  }
  return plateaus
}

function pitchRange(derivation: Derivation): { highHz: number; lowHz: number; confidence: number } | null {
  const { clean, coverage } = derivation
  if (clean.length < MIN_PITCH_FRAMES || coverage < 0.15) return null
  const values = clean.map((frame) => frame.f0_hz)
  // A robust extreme (the 95th/5th percentile), not the single max/min: one frame
  // where the core tracks an octave off would otherwise invent a note nobody sang.
  const highHz = quantile(values, 0.95)!
  const lowHz = quantile(values, 0.05)!
  // Confidence tracks how much voiced audio there is and how sure the core was.
  const confidence = clamp01(0.5 + 0.3 * coverage + 0.2 * derivation.meanF0Confidence)
  return { highHz, lowHz, confidence }
}

function warmupSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = []
  const { runs, hopMs, voiced } = derivation

  if (runs.length >= 1 && runs.length <= 20) {
    const repetitions = runs.length
    suggestions.push({
      field: 'repetitions',
      label: 'Repetitions',
      displayValue: String(repetitions),
      confidence: clamp01(0.5 + 0.3 * Math.min(1, runs.length / 3)),
      method: 'Counted the voiced bursts separated by rests.',
      caveat: repetitions === 1 ? 'Heard as one continuous note.' : undefined,
      apply: () => ({ repetitions }),
    })
  }

  // A break is a loss of voicing inside an attempt (short gap between sustained
  // runs) or a sudden octave jump within a run. Rests between repetitions are
  // longer than the break window, so they are not counted.
  const sustained = voicedRuns(derivation.frames, hopMs, { gapToleranceMs: 0, minRunMs: MIN_SUSTAINED_RUN_MS })
  let breaks = 0
  for (let index = 1; index < sustained.length; index += 1) {
    const gap = sustained[index]!.startMs - sustained[index - 1]!.endMs
    if (gap >= 60 && gap <= VOICE_BREAK_MAX_GAP_MS) breaks += 1
  }
  for (const run of runs) {
    for (let index = 1; index < run.frames.length; index += 1) {
      const jump = Math.abs(hzToSemitones(run.frames[index]!.f0_hz) - hzToSemitones(run.frames[index - 1]!.f0_hz))
      if (jump >= VOICE_BREAK_SEMITONES) breaks += 1
    }
  }
  if (voiced.length >= MIN_PITCH_FRAMES) {
    const breakCount = Math.min(breaks, MAX_VOICE_BREAKS)
    suggestions.push({
      field: 'voiceBreaks',
      label: 'Voice breaks',
      displayValue: String(breakCount),
      confidence: 0.6,
      method: 'Gaps and sudden octave jumps inside the sustained note.',
      caveat: 'A break you heard is the authority; this counts what the analyser saw.',
      apply: () => ({ voiceBreaks: breakCount }),
    })
  }

  const clarity = clarityRatingOf(derivation)
  if (clarity !== null) {
    suggestions.push(clarity)
  }

  return suggestions
}

/**
 * Vibration clarity as a 0-100 rating: harmonicity (HNR) is the bulk of it, with a
 * penalty for high jitter and shimmer (a rough, unsteady vibration). A rating, not a
 * clinical measure, and said so on the suggestion.
 */
function clarityRatingOf(derivation: Derivation): SegmentSuggestion | null {
  const voiced = derivation.voiced
  if (voiced.length < MIN_PITCH_FRAMES) return null
  const hnr = voiced.map((frame) => frame.hnr_db).filter((value): value is number => typeof value === 'number')
  if (hnr.length < voiced.length / 2) return null
  const hnrScore = clamp01(((median(hnr) ?? 0) - 6) / (30 - 6))
  const jitter = mean(voiced.map((frame) => frame.jitter_local).filter((value): value is number => typeof value === 'number'))
  const shimmer = mean(voiced.map((frame) => frame.shimmer_local).filter((value): value is number => typeof value === 'number'))
  const jitterPenalty = jitter === null ? 0 : clamp01(jitter / 0.02)
  const shimmerPenalty = shimmer === null ? 0 : clamp01(shimmer / 0.1)
  const rating = Math.round(100 * clamp01(hnrScore * (1 - 0.5 * jitterPenalty) * (1 - 0.4 * shimmerPenalty)))
  return {
    field: 'clarityRating',
    label: 'Vibration clarity',
    displayValue: String(rating),
    confidence: 0.55,
    method: 'Harmonicity (HNR), with jitter and shimmer penalties.',
    caveat: 'A rating, not a clinical measure.',
    apply: () => ({ clarityRating: rating }),
  }
}

function pitchFieldSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const range = pitchRange(derivation)
  if (!range) return []
  const { highHz, lowHz, confidence } = range
  const high = Math.round(highHz)
  const low = Math.round(lowHz)
  const withPitch = (patch: Partial<ReturnType<typeof createEmptyPitchWork>>) => (segment: SessionSegmentInput) => ({
    pitch: { ...(segment.pitch ?? createEmptyPitchWork()), ...patch },
  })
  return [
    {
      field: 'pitch.highHz',
      label: 'High note',
      displayValue: formatHz(highHz),
      confidence,
      method: 'Highest confident pitch in the clip.',
      apply: withPitch({ highHz: high }),
    },
    {
      field: 'pitch.lowHz',
      label: 'Low note',
      displayValue: formatHz(lowHz),
      confidence,
      method: 'Lowest confident pitch in the clip.',
      apply: withPitch({ lowHz: low }),
    },
  ]
}

function glideSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const suggestions = pitchFieldSuggestions(derivation)
  const { runs } = derivation

  const velocities = runs.flatMap((run) => runPitchVelocities(run))
  const rate = median(velocities.map((value) => Math.abs(value)))
  if (rate !== null && velocities.length >= MIN_PITCH_FRAMES) {
    const pace: GlidePace =
      rate < GLIDE_SLOW_MAX_SEMITONES_PER_SECOND
        ? 'slow'
        : rate > GLIDE_FAST_MIN_SEMITONES_PER_SECOND
          ? 'fast'
          : 'mixed'
    const label = pace === 'slow' ? 'Slow and steady' : pace === 'mixed' ? 'Mixed speeds' : 'Faster'
    suggestions.push({
      field: 'glidePace',
      label: 'Pace',
      displayValue: label,
      confidence: 0.55,
      method: `Median pitch-change rate of about ${rate.toFixed(1)} semitones per second.`,
      caveat: 'Read from how fast the pitch moved, not from how it felt.',
      apply: () => ({ glidePace: pace }),
    })
  }

  let shifts = 0
  for (const run of runs) {
    for (let index = 1; index < run.frames.length; index += 1) {
      const jump = Math.abs(hzToSemitones(run.frames[index]!.f0_hz) - hzToSemitones(run.frames[index - 1]!.f0_hz))
      if (jump >= REGISTER_SHIFT_SEMITONES) shifts += 1
    }
  }
  if (derivation.voiced.length >= MIN_PITCH_FRAMES) {
    const shiftCount = Math.min(shifts, MAX_REGISTER_SHIFTS)
    suggestions.push({
      field: 'registerShifts',
      label: 'Register shifts noticed',
      displayValue: String(shiftCount),
      confidence: 0.55,
      method: 'Sudden jumps in pitch inside the glides.',
      caveat: 'The abrupt changes the analyser saw, which is not every shift you felt.',
      apply: () => ({ registerShifts: shiftCount }),
    })
  }

  // The ideal-speaking-range low note is a choice the plan sets no target for, so
  // it is only offered when the clip actually settled on a low note.
  const settledLow = sustainedLowNote(derivation)
  if (settledLow !== null) {
    suggestions.push({
      field: 'pitch.speakingRangeLowHz',
      label: 'Speaking-range low note',
      displayValue: formatHz(settledLow),
      confidence: 0.45,
      method: 'The lowest note you held steady at the end.',
      caveat: 'The plan sets no target for this one - adjust it if you meant something else.',
      apply: (segment) => ({
        pitch: { ...(segment.pitch ?? createEmptyPitchWork()), speakingRangeLowHz: Math.round(settledLow) },
      }),
    })
  }

  return suggestions
}

function sustainedLowNote(derivation: Derivation): number | null {
  const sustained = derivation.runs.filter((run) => runDurationMs(run, derivation.hopMs) >= 500)
  if (sustained.length === 0) return null
  const lowest = sustained.reduce((low, run) => (runCenterSemitones(run) < runCenterSemitones(low) ? run : low))
  return lowest.frames.length >= MIN_PITCH_FRAMES ? median(lowest.frames.map((frame) => frame.f0_hz)) : null
}

function powerSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const suggestions = pitchFieldSuggestions(derivation)
  const { runs, hopMs } = derivation
  if (runs.length === 0) return suggestions

  const plateaus = notePlateaus(runs)

  const longestRun = runs.reduce((longest, run) => (runDurationMs(run, hopMs) > runDurationMs(longest, hopMs) ? run : longest))
  const longestSustainSeconds = Math.max(1, Math.round(runDurationMs(longestRun, hopMs) / 1_000))
  suggestions.push({
    field: 'longestSustainSeconds',
    label: 'Longest sustain (seconds)',
    displayValue: `${longestSustainSeconds}s`,
    confidence: clamp01(0.6 + 0.25 * derivation.coverage),
    method: 'The longest unbroken hold.',
    apply: () => ({ longestSustainSeconds }),
  })

  if (plateaus.length >= 1 && plateaus.length <= 40) {
    const notesClimbed = plateaus.length
    suggestions.push({
      field: 'notesClimbed',
      label: 'Notes climbed',
      displayValue: String(notesClimbed),
      confidence: 0.6,
      method: 'Distinct sustained notes, counted where the pitch held and moved.',
      apply: () => ({ notesClimbed }),
    })
  }

  const firstRun = runs[0]!
  const startNote = noteNameForHz(median(firstRun.frames.map((frame) => frame.f0_hz)) ?? firstRun.frames[0]!.f0_hz)
  suggestions.push({
    field: 'startNote',
    label: 'Start note',
    displayValue: startNote,
    confidence: 0.55,
    method: 'The first note the clip settled on.',
    apply: () => ({ startNote }),
  })

  const range = pitchRange(derivation)
  if (range) {
    const topNote = noteNameForHz(range.highHz)
    const bottomNote = noteNameForHz(range.lowHz)
    suggestions.push({
      field: 'topNote',
      label: 'Top note',
      displayValue: topNote,
      confidence: range.confidence,
      method: 'The highest note reached.',
      apply: () => ({ topNote }),
    })
    suggestions.push({
      field: 'bottomNote',
      label: 'Bottom note',
      displayValue: bottomNote,
      confidence: range.confidence,
      method: 'The lowest note reached.',
      apply: () => ({ bottomNote }),
    })
  }

  // POWER - down is the pass that identifies a comfortable speaking range: several
  // steps down, and a settled low note at the end.
  if (derivation.kind === 'powerDescending' && plateaus.length >= 4 && range) {
    const last = plateaus[plateaus.length - 1]!
    const lastCenter = runCenterSemitones(last[last.length - 1]!)
    const startedHigh = hzToSemitones(range.highHz) - lastCenter >= REGISTER_SHIFT_SEMITONES
    if (startedHigh) {
      suggestions.push({
        field: 'identifiedComfortableRange',
        label: 'Marked a comfortable speaking range',
        displayValue: 'Marked',
        confidence: 0.5,
        method: 'Descended through several steps and settled on a lower note.',
        caveat: 'The plan leaves the low note to your ear; tick this only if it felt like your range.',
        apply: () => ({ identifiedComfortableRange: true }),
      })
    }
  }

  return suggestions
}

function stretchAndFlowSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = []
  const { voicedFraction, audible } = derivation
  if (audible.length === 0) return suggestions

  const stage =
    voicedFraction < AIR_ONLY_MAX_VOICED_FRACTION
      ? STRETCH_AND_FLOW_STAGES.find((candidate) => candidate.id === 'phase1')
      : voicedFraction < PHASE_THREE_MIN_VOICED_FRACTION
        ? STRETCH_AND_FLOW_STAGES.find((candidate) => candidate.id === 'phase2')
        : STRETCH_AND_FLOW_STAGES.find((candidate) => candidate.id === 'phase3')

  if (stage) {
    const margin =
      stage.id === 'phase1'
        ? (AIR_ONLY_MAX_VOICED_FRACTION - voicedFraction) / AIR_ONLY_MAX_VOICED_FRACTION
        : stage.id === 'phase2'
          ? Math.min(voicedFraction - AIR_ONLY_MAX_VOICED_FRACTION, PHASE_THREE_MIN_VOICED_FRACTION - voicedFraction) /
            (PHASE_THREE_MIN_VOICED_FRACTION - AIR_ONLY_MAX_VOICED_FRACTION)
          : (voicedFraction - PHASE_THREE_MIN_VOICED_FRACTION) / (1 - PHASE_THREE_MIN_VOICED_FRACTION)
    suggestions.push({
      field: 'stretchAndFlow.stage',
      label: 'Stage',
      displayValue: `${stage.label}${stage.ratioLabel ? ` (${stage.ratioLabel})` : ''}`,
      confidence: clamp01(0.5 + 0.4 * margin),
      method: `About ${Math.round(voicedFraction * 100)}% of the clip carried voicing.`,
      caveat: 'Your SLP decides the phase; this is only what the audio sounded like.',
      apply: (segment) => stretchAndFlowStagePatch(segment, stage),
    })
  }

  const coordination = coordinationRatingOf(derivation)
  if (coordination !== null) suggestions.push(coordination)

  return suggestions
}

/**
 * Breathing and phonation together, as a 0-100 rating: steady level and little
 * creak while voiced reads as well-coordinated.
 */
function coordinationRatingOf(derivation: Derivation): SegmentSuggestion | null {
  const voiced = derivation.voiced
  if (voiced.length < MIN_PITCH_FRAMES) return null
  const creakRate = voiced.filter((frame) => (frame.flags & FLAGS.CREAK) !== 0).length / voiced.length
  const levels = voiced.map((frame) => frame.rms_dbfs).filter((value): value is number => typeof value === 'number')
  const spread = standardDeviation(levels)
  const levelStability = spread === null ? 0.5 : 1 - clamp01(spread / 6)
  const rating = Math.round(100 * clamp01(0.7 * (1 - creakRate) + 0.3 * levelStability))
  return {
    field: 'coordinationRating',
    label: 'Breathing and phonation together',
    displayValue: String(rating),
    confidence: 0.45,
    method: 'Steadiness of the voiced stretches (level and creak).',
    caveat: 'A rating, not a clinical measure.',
    apply: () => ({ coordinationRating: rating }),
  }
}

function resonanceSuggestions(derivation: Derivation): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = []
  const { voiced, runs } = derivation

  const settled = median(voiced.slice(Math.floor(voiced.length / 2)).map((frame) => frame.f0_hz))
  if (settled !== null && voiced.length >= MIN_PITCH_FRAMES) {
    const comfortablePitchHz = Math.round(settled)
    suggestions.push({
      field: 'resonance.comfortablePitchHz',
      label: 'Comfortable pitch',
      displayValue: formatHz(settled),
      confidence: clamp01(0.45 + 0.35 * derivation.coverage),
      method: 'Median pitch of the sustained phonation.',
      apply: (segment) => ({
        resonance: { ...(segment.resonance ?? createEmptyResonanceDetail()), comfortablePitchHz },
      }),
    })
  }

  // A shaped phrase is a voiced run whose pitch spans a few semitones - an
  // intonation pass rather than a held note.
  const shapedPhrases = runs.filter((run) => {
    const values = run.frames.map((frame) => hzToSemitones(frame.f0_hz))
    return Math.max(...values) - Math.min(...values) >= CONTOUR_SEMITONES
  }).length
  if (shapedPhrases >= 1) {
    const repetitions = Math.min(shapedPhrases, MAX_INTONATION_REPETITIONS)
    suggestions.push({
      field: 'resonance.intonationRepetitions',
      label: 'Intonation repetitions',
      displayValue: String(repetitions),
      confidence: 0.4,
      method: 'Voiced phrases whose pitch rose or fell by a few semitones.',
      caveat: 'Counts shaped phrases, not every repetition you did.',
      apply: (segment) => ({
        resonance: { ...(segment.resonance ?? createEmptyResonanceDetail()), intonationRepetitions: repetitions },
      }),
    })
  }

  const completedStepIds: string[] = []
  const firstVoicedMs = runs[0]?.startMs ?? derivation.frames[0]?.t_ms ?? 0
  const leadingAudible = derivation.audible.some((frame) => frame.t_ms < firstVoicedMs && firstVoicedMs - frame.t_ms > 400)
  if (leadingAudible) completedStepIds.push('contrastResonance')
  const heldPitch = runs.some((run) => runDurationMs(run, derivation.hopMs) >= 1_000)
  if (heldPitch) completedStepIds.push('pitchMonitorVowel')
  if (completedStepIds.length > 0) {
    suggestions.push({
      field: 'resonance.steps',
      label: 'Ladder',
      displayValue: `${completedStepIds.length} step${completedStepIds.length === 1 ? '' : 's'} heard`,
      confidence: 0.5,
      method: 'An unvoiced opening into a held pitch, where the clip shows it.',
      caveat: 'Only the rungs the audio could tell apart from the others.',
      apply: (segment) => {
        const detail = segment.resonance ?? createEmptyResonanceDetail()
        const steps: ResonanceStepProgress[] = [...detail.steps]
        for (const stepId of completedStepIds) {
          const index = steps.findIndex((step) => step.stepId === stepId)
          if (index >= 0) steps[index] = { ...steps[index]!, completed: true }
          else steps.push({ stepId, completed: true })
        }
        return { resonance: { ...detail, steps } }
      },
    })
  }

  return suggestions
}

function enduranceSuggestions(derivation: Derivation, analyzedSeconds: number): SegmentSuggestion[] {
  const suggestions: SegmentSuggestion[] = []
  const { runs, voiced } = derivation
  if (analyzedSeconds < 20 || runs.length === 0) return suggestions

  const phrasesPerMinute = (runs.length / analyzedSeconds) * 60
  const paceRating = Math.round(100 * clamp01(phrasesPerMinute / 40))
  suggestions.push({
    field: 'paceRating',
    label: 'Pace',
    displayValue: String(paceRating),
    confidence: 0.4,
    method: `About ${Math.round(phrasesPerMinute)} voiced bursts a minute.`,
    caveat: 'A rough proxy: burst rate, not words per minute.',
    apply: () => ({ paceRating }),
  })

  // Fatigue: harmonicity down and pitch drifting down from the start of the clip to
  // the end is the shape a tiring voice makes.
  if (analyzedSeconds >= 30 && voiced.length >= MIN_PITCH_FRAMES * 2) {
    const third = Math.floor(derivation.frames.length / 3)
    const early = derivation.clean.filter((frame) => frame.t_ms <= (derivation.frames[third]?.t_ms ?? 0))
    const late = derivation.clean.filter(
      (frame) => frame.t_ms >= (derivation.frames[derivation.frames.length - third]?.t_ms ?? 0),
    )
    const earlyHnr = median(early.map((frame) => frame.hnr_db).filter((value): value is number => typeof value === 'number'))
    const lateHnr = median(late.map((frame) => frame.hnr_db).filter((value): value is number => typeof value === 'number'))
    const earlyF0 = median(early.map((frame) => frame.f0_hz))
    const lateF0 = median(late.map((frame) => frame.f0_hz))
    if (early.length >= 4 && late.length >= 4 && earlyF0 !== null && lateF0 !== null) {
      const hnrDrop = earlyHnr !== null && lateHnr !== null ? earlyHnr - lateHnr : 0
      const pitchDrop = hzToSemitones(earlyF0) - hzToSemitones(lateF0)
      const fatigueRating = Math.round(
        100 * clamp01(0.7 * clamp01(hnrDrop / 6) + 0.3 * clamp01(pitchDrop / (REGISTER_SHIFT_SEMITONES - 1))),
      )
      suggestions.push({
        field: 'fatigueRating',
        label: 'Fatigue by the end',
        displayValue: String(fatigueRating),
        confidence: 0.4,
        method: 'Change in harmonicity and pitch from the start of the clip to the end.',
        caveat: 'A rating, not a clinical measure.',
        apply: () => ({ fatigueRating }),
      })
    }
  }

  return suggestions
}

/** Builds the derivation context once, so every composer reads the same frames. */
function buildDerivation(input: DeriveInput): Derivation {
  const frames = input.frames
  const hopMs = frameHopMs(frames)
  const voiced = frames.filter(isVoiced)
  const clean = voiced.filter((frame) => (frame.flags & FLAGS.SUBHARMONIC) === 0)
  const audible = frames.filter(isAudible)
  const voicedAudible = audible.filter(isVoiced).length
  const voicedFraction = audible.length > 0 ? voicedAudible / audible.length : frames.length > 0 ? voiced.length / frames.length : 0
  return {
    kind: input.kind,
    frames,
    voiced,
    clean,
    audible,
    hopMs,
    coverage: clamp01((voiced.length * hopMs) / FULL_COVERAGE_MS),
    voicedFraction,
    runs: voicedRuns(frames, hopMs),
    meanF0Confidence: mean(voiced.map((frame) => frame.f0_confidence)) ?? 0,
  }
}

/**
 * Reads the core's frames for one recorded step and returns the fields it can
 * speak to, most trustworthy first. The clip's own length is always offered; the
 * rest depend on how much clear voice the core found.
 */
export function deriveSegmentFields(input: DeriveInput): SegmentSuggestions {
  const derivation = buildDerivation(input)
  const analyzedSeconds =
    input.analyzedSeconds ??
    (derivation.frames.length > 0
      ? (Math.max(...derivation.frames.map((frame) => frame.t_ms)) + derivation.hopMs) / 1_000
      : 0)

  const suggestions: SegmentSuggestion[] = []
  const durationSeconds = input.durationSeconds
  if (durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const seconds = Math.round(durationSeconds)
    suggestions.push({
      field: 'seconds',
      label: 'Minutes',
      displayValue: formatDuration(seconds),
      confidence: 1,
      method: "The clip's own length.",
      apply: () => ({ seconds }),
    })
  }

  suggestions.push(...suggestionsForKind(derivation, analyzedSeconds))

  suggestions.sort((left, right) => right.confidence - left.confidence)

  return {
    kind: input.kind,
    frameCount: derivation.frames.length,
    voicedFrameCount: derivation.voiced.length,
    analyzedSeconds,
    truncated: input.truncated ?? false,
    suggestions,
  }
}

function suggestionsForKind(derivation: Derivation, analyzedSeconds: number): SegmentSuggestion[] {
  switch (derivation.kind) {
    case 'warmupNote':
      return warmupSuggestions(derivation)
    case 'glides':
      return glideSuggestions(derivation)
    case 'powerAscending':
    case 'powerDescending':
      return powerSuggestions(derivation)
    case 'stretchAndFlow':
      return stretchAndFlowSuggestions(derivation)
    case 'resonance':
      return resonanceSuggestions(derivation)
    case 'endurance':
      return enduranceSuggestions(derivation, analyzedSeconds)
    case 'carryover':
      return []
  }
}
