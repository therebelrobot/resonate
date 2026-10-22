import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { decodeFrames, framesView, loadEngine } from 'sonorant'
import type { VoiceFrame } from 'sonorant-react'
import { analyzeSamples } from '../client/audio/runAnalysis'
import {
  deriveSegmentFields,
  type SegmentSuggestion,
  type SegmentSuggestions,
} from '../client/audio/deriveSegmentFields'
import {
  createEmptySegmentInput,
  stretchAndFlowStagePatch,
  type SegmentKind,
  type SessionSegmentInput,
} from '../shared/model'
import { STRETCH_AND_FLOW_STAGE_BY_ID } from '../shared/protocol'

const HOP_MS = 512 / 44.1 // the core's default hop at 44.1 kHz, in ms

interface FrameOptions {
  f0Confidence?: number
  rmsDbfs?: number
  flags?: number
  hnrDb?: number
  jitter?: number
  shimmer?: number
}

function frame(tMs: number, f0Hz: number, options: FrameOptions = {}): VoiceFrame {
  return {
    t_ms: tMs,
    f0_hz: f0Hz,
    voicing: options.f0Confidence ?? 0.98,
    f0_confidence: options.f0Confidence ?? 0.98,
    formants: [],
    hnr_db: options.hnrDb ?? 22,
    cpp_db: 12,
    tilt_db_per_oct: -8,
    h1_h2_db: 8,
    centroid_hz: f0Hz * 2,
    scale_semitones: 0,
    rms_dbfs: options.rmsDbfs ?? -18,
    jitter_local: options.jitter ?? 0.004,
    shimmer_local: options.shimmer ?? 0.02,
    flags: options.flags ?? 0,
  }
}

/** Appends a voiced hold at one pitch, one frame per hop. */
function hold(frames: VoiceFrame[], startMs: number, durationMs: number, hz: number): number {
  let t = startMs
  const end = startMs + durationMs
  while (t < end) {
    frames.push(frame(t, hz))
    t += HOP_MS
  }
  return t
}

/** Appends a silent stretch; the core reports no voicing and a very low level. */
function rest(frames: VoiceFrame[], startMs: number, durationMs: number): number {
  let t = startMs
  const end = startMs + durationMs
  while (t < end) {
    frames.push(frame(t, 0, { f0Confidence: 0, rmsDbfs: -70 }))
    t += HOP_MS
  }
  return t
}

/** Appends an audible but unvoiced stretch - air without voice, as in Phase 1. */
function air(frames: VoiceFrame[], startMs: number, durationMs: number): number {
  let t = startMs
  const end = startMs + durationMs
  while (t < end) {
    frames.push(frame(t, 0, { f0Confidence: 0, rmsDbfs: -30 }))
    t += HOP_MS
  }
  return t
}

/** A smooth pitch sweep, the shape of a glide. */
function glide(frames: VoiceFrame[], startMs: number, durationMs: number, fromHz: number, toHz: number): number {
  let t = startMs
  const end = startMs + durationMs
  const steps: { t: number; hz: number }[] = []
  while (t < end) {
    const progress = (t - startMs) / durationMs
    steps.push({ t, hz: fromHz * (toHz / fromHz) ** progress })
    t += HOP_MS
  }
  for (const step of steps) frames.push(frame(step.t, step.hz))
  return t
}

function suggestionOf(result: SegmentSuggestions, field: string): SegmentSuggestion | undefined {
  return result.suggestions.find((suggestion) => suggestion.field === field)
}

function applyOf(result: SegmentSuggestions, field: string, segment = createEmptySegmentInput('glides')): Partial<SessionSegmentInput> {
  const suggestion = suggestionOf(result, field)
  assert.ok(suggestion, `expected a ${field} suggestion`)
  return suggestion.apply(segment)
}

const segment = (kind: SegmentKind, patch: Partial<SessionSegmentInput> = {}): SessionSegmentInput => ({
  ...createEmptySegmentInput(kind),
  ...patch,
})

describe('deriveSegmentFields - the clip length is always offered', () => {
  it('offers minutes from the clip length even with no frames', () => {
    const result = deriveSegmentFields({ kind: 'carryover', frames: [], durationSeconds: 100 })
    assert.equal(result.suggestions.length, 1)
    const suggestion = result.suggestions[0]!
    assert.equal(suggestion.field, 'seconds')
    assert.equal(suggestion.confidence, 1)
    assert.equal(suggestion.displayValue, '1:40')
    assert.deepEqual(suggestion.apply(segment('carryover')), { seconds: 100 })
  })

  it('offers nothing but the length when the clip length is unknown', () => {
    const result = deriveSegmentFields({ kind: 'glides', frames: [], durationSeconds: null })
    assert.equal(result.suggestions.length, 0)
  })
})

describe('deriveSegmentFields - glides', () => {
  const frames: VoiceFrame[] = []
  glide(frames, 0, 2_000, 174.61, 349.23)
  const result = deriveSegmentFields({ kind: 'glides', frames, durationSeconds: 2 })

  it('reads the high and low note from the swept range', () => {
    const high = applyOf(result, 'pitch.highHz')
    const low = applyOf(result, 'pitch.lowHz')
    assert.ok((high.pitch?.highHz ?? 0) > 330, `high was ${high.pitch?.highHz}`)
    assert.ok((low.pitch?.lowHz ?? 0) < 190, `low was ${low.pitch?.lowHz}`)
  })

  it('folds both pitch values into one patch when applied in sequence', () => {
    const merged = { ...segment('glides'), ...applyOf(result, 'pitch.highHz') }
    const both = applyOf(result, 'pitch.lowHz', merged)
    assert.ok(both.pitch?.highHz !== null && both.pitch?.lowHz !== null)
  })

  it('calls a steady octave-per-two-seconds sweep mixed pace and no register shifts', () => {
    assert.equal(applyOf(result, 'glidePace').glidePace, 'mixed')
    assert.equal(applyOf(result, 'registerShifts').registerShifts, 0)
  })

  it('offers nothing for a sub-threshold amount of clear voice', () => {
    const thin = [frame(0, 220), frame(HOP_MS, 220)]
    const thinResult = deriveSegmentFields({ kind: 'glides', frames: thin, durationSeconds: 1 })
    assert.equal(suggestionOf(thinResult, 'pitch.highHz'), undefined)
  })
})

describe('deriveSegmentFields - warm-up note', () => {
  it('counts repetitions and breaks', () => {
    const frames: VoiceFrame[] = []
    let t = hold(frames, 0, 700, 262)
    t = rest(frames, t, 1_200)
    t = hold(frames, t, 700, 262)
    const result = deriveSegmentFields({ kind: 'warmupNote', frames, durationSeconds: 3 })
    assert.equal(applyOf(result, 'repetitions').repetitions, 2)
    assert.equal(applyOf(result, 'voiceBreaks').voiceBreaks, 0)
  })

  it('counts an octave jump inside a hold as a break', () => {
    const frames: VoiceFrame[] = []
    let t = hold(frames, 0, 500, 175)
    t = hold(frames, t, 500, 350)
    const result = deriveSegmentFields({ kind: 'warmupNote', frames, durationSeconds: 1 })
    assert.equal(applyOf(result, 'voiceBreaks').voiceBreaks, 1)
  })

  it('clamps a count to the field ceiling so a reading can always be saved', () => {
    // Alternating far jumps on every frame would otherwise count far past the
    // schema's maximum of 50.
    const frames: VoiceFrame[] = []
    for (let index = 0; index < 400; index += 1) {
      frames.push(frame(index * HOP_MS, index % 2 === 0 ? 100 : 400))
    }
    const result = deriveSegmentFields({ kind: 'warmupNote', frames, durationSeconds: 5 })
    assert.equal(applyOf(result, 'voiceBreaks').voiceBreaks, 50)
  })
})

describe('deriveSegmentFields - POWER', () => {
  it('counts sustained steps and the longest hold', () => {
    const frames: VoiceFrame[] = []
    let t = 0
    for (const hz of [174.61, 196, 220, 246.94, 261.63]) {
      t = hold(frames, t, 800, hz)
      t = rest(frames, t, 400)
    }
    const result = deriveSegmentFields({ kind: 'powerAscending', frames, durationSeconds: 6 })
    assert.equal(applyOf(result, 'notesClimbed').notesClimbed, 5)
    assert.ok((applyOf(result, 'longestSustainSeconds').longestSustainSeconds ?? 0) >= 1)
    assert.ok(suggestionOf(result, 'topNote'), 'expected a top note')
    assert.ok(suggestionOf(result, 'bottomNote'), 'expected a bottom note')
  })
})

describe('deriveSegmentFields - Stretch and Flow', () => {
  it('reads Phase 1 from a clip that is almost all air', () => {
    const frames: VoiceFrame[] = []
    let t = air(frames, 0, 2_000)
    t = hold(frames, t, 120, 200)
    air(frames, t, 2_000)
    const result = deriveSegmentFields({ kind: 'stretchAndFlow', frames, durationSeconds: 4 })
    const patch = applyOf(result, 'stretchAndFlow.stage', segment('stretchAndFlow'))
    assert.equal(patch.stretchAndFlow?.stageId, 'phase1')
    assert.equal(patch.stretchAndFlow?.ratio, 'airOnly')
    assert.equal(patch.phaseNumber, 1)
  })

  it('reads Phase 3 from a clip that is mostly voiced', () => {
    const frames: VoiceFrame[] = []
    let t = hold(frames, 0, 1_200, 220)
    t = air(frames, t, 300)
    t = hold(frames, t, 1_200, 233)
    air(frames, t, 300)
    const result = deriveSegmentFields({ kind: 'stretchAndFlow', frames, durationSeconds: 3 })
    assert.equal(applyOf(result, 'stretchAndFlow.stage', segment('stretchAndFlow')).stretchAndFlow?.stageId, 'phase3')
  })
})

describe('deriveSegmentFields - resonance', () => {
  it('reads a comfortable pitch from a sustained note', () => {
    const frames: VoiceFrame[] = []
    hold(frames, 0, 2_500, 196)
    const result = deriveSegmentFields({ kind: 'resonance', frames, durationSeconds: 3 })
    const patch = applyOf(result, 'resonance.comfortablePitchHz', segment('resonance'))
    const hz = patch.resonance?.comfortablePitchHz ?? 0
    assert.ok(Math.abs(hz - 196) <= 2, `comfortable pitch was ${hz}`)
  })
})

describe('deriveSegmentFields - endurance takes a longer clip', () => {
  it('offers a pace reading from a long clip but not a short one', () => {
    const long: VoiceFrame[] = []
    let t = 0
    for (let index = 0; index < 15; index += 1) {
      t = hold(long, t, 1_000, 200)
      t = rest(long, t, 500)
    }
    const longResult = deriveSegmentFields({ kind: 'endurance', frames: long, durationSeconds: 22 })
    assert.ok(suggestionOf(longResult, 'paceRating'), 'expected a pace reading')

    const short: VoiceFrame[] = []
    hold(short, 0, 2_000, 200)
    const shortResult = deriveSegmentFields({ kind: 'endurance', frames: short, durationSeconds: 2 })
    assert.equal(suggestionOf(shortResult, 'paceRating'), undefined)
  })
})

describe('stretchAndFlowStagePatch', () => {
  it('preserves carryover and existing step progress while seeding the shape', () => {
    const stage = STRETCH_AND_FLOW_STAGE_BY_ID.get('phase2')!
    const current = segment('stretchAndFlow', {
      stretchAndFlow: {
        stageId: null,
        ratio: null,
        usedTissue: true,
        steps: [{ stepId: 'openThroat', completed: true, breathCount: 6 }],
        cuesChecked: ['elongateVowels'],
        toggledAirOnlyAndVoiced: null,
        carryover: { kind: 'sentence', itemIds: ['sentence1'], customText: 'kept' },
      },
    })
    const patch = stretchAndFlowStagePatch(current, stage)
    assert.equal(patch.stretchAndFlow?.stageId, 'phase2')
    assert.equal(patch.stretchAndFlow?.ratio, 'twentyEighty')
    assert.equal(patch.phaseNumber, 2)
    assert.equal(patch.stretchAndFlow?.carryover?.customText, 'kept')
    assert.equal(patch.stretchAndFlow?.steps.find((step) => step.stepId === 'openThroat')?.breathCount, 6)
  })
})

describe('deriveSegmentFields - through the real Sonorant core', () => {
  it('reads a 220 Hz tone as a 220 Hz pitch', async () => {
    const wasmBytes = readFileSync(new URL('../node_modules/sonorant/pkg/sonorant_ffi_bg.wasm', import.meta.url))
    const engine = await loadEngine(44_100, { wasmBytes })
    engine.configure(2048, 512, 24)
    const sampleCount = 44_100 * 2
    const pcm = new Float32Array(sampleCount)
    for (let index = 0; index < sampleCount; index += 1) pcm[index] = 0.4 * Math.sin((2 * Math.PI * 220 * index) / 44_100)
    engine.push(pcm)
    const frames = decodeFrames(framesView(engine).slice()) as unknown as VoiceFrame[]

    const result = deriveSegmentFields({ kind: 'glides', frames, durationSeconds: 2 })
    assert.ok(result.voicedFrameCount > 100, `voiced frames: ${result.voicedFrameCount}`)
    const high = suggestionOf(result, 'pitch.highHz')
    const low = suggestionOf(result, 'pitch.lowHz')
    assert.ok(high && low)
    const highHz = high.apply(segment('glides')).pitch?.highHz ?? 0
    const lowHz = low.apply(segment('glides')).pitch?.lowHz ?? 0
    assert.ok(Math.abs(highHz - 220) <= 3, `high was ${highHz}`)
    assert.ok(Math.abs(lowHz - 220) <= 3, `low was ${lowHz}`)
  })

  it('keeps every chunk of a long clip, not only the last', async () => {
    // Regression: the core's frame view holds only the most recent push, so a
    // one-shot reader that reads the view at the end keeps the last chunk alone.
    const wasmBytes = readFileSync(new URL('../node_modules/sonorant/pkg/sonorant_ffi_bg.wasm', import.meta.url))
    const sampleCount = 44_100 * 8
    const pcm = new Float32Array(sampleCount)
    for (let index = 0; index < sampleCount; index += 1) pcm[index] = 0.35 * Math.sin((2 * Math.PI * 220 * index) / 44_100)

    const chunkedEngine = await loadEngine(44_100, { wasmBytes })
    chunkedEngine.configure(2048, 512, 24)
    const chunked = analyzeSamples(chunkedEngine, pcm)

    const singleEngine = await loadEngine(44_100, { wasmBytes })
    singleEngine.configure(2048, 512, 24)
    singleEngine.push(pcm)
    const single = decodeFrames(framesView(singleEngine).slice())

    assert.ok(chunked.length > 600, `chunked frames: ${chunked.length}`)
    assert.equal(chunked.length, single.length)
  })
})
