import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sessionSegmentInputSchema } from '../server/schemas'
import { VFE_PITCH_TARGETS } from '../shared/protocol'
import {
  createEmptyCarryoverDetail,
  createEmptyPitchWork,
  createEmptyResonanceDetail,
  createEmptySegmentInput,
  normalizeSegmentInput,
  noteNameForHz,
  parseBreathCountInput,
  type CarryoverDetail,
  type PitchWorkInput,
  type ResonanceDetail,
  type SessionSegmentInput,
  type StretchAndFlowDetail,
} from '../shared/model'

function segment(patch: Partial<SessionSegmentInput> = {}): SessionSegmentInput {
  return { ...createEmptySegmentInput('stretchAndFlow'), ...patch }
}

const FULL_DETAIL: StretchAndFlowDetail = {
  stageId: 'phase2',
  ratio: 'twentyEighty',
  usedTissue: true,
  steps: [{ stepId: 'oneNumber', completed: true, breathCount: 10 }],
  cuesChecked: ['elongateVowels'],
  toggledAirOnlyAndVoiced: null,
  carryover: { kind: 'singleWord', itemIds: ['free'], customText: '' },
}

/** Deliberately invalid payloads, cast so the test can exercise the validator. */
const invalidDetail = (patch: Record<string, unknown>): StretchAndFlowDetail =>
  ({ ...FULL_DETAIL, ...patch }) as unknown as StretchAndFlowDetail

describe('stretch and flow schema', () => {
  it('accepts a full detail object', () => {
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ phaseNumber: 2, stretchAndFlow: FULL_DETAIL })).success, true)
  })

  it('accepts a null detail', () => {
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ stretchAndFlow: null })).success, true)
  })

  it('rejects an unknown ratio', () => {
    const result = sessionSegmentInputSchema.safeParse(segment({ stretchAndFlow: invalidDetail({ ratio: 'seventyThirty' }) }))
    assert.equal(result.success, false)
  })

  it('rejects a breath count out of range', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({
        stretchAndFlow: invalidDetail({ steps: [{ stepId: 'oneNumber', completed: true, breathCount: 101 }] }),
      }),
    )
    assert.equal(result.success, false)
  })

  it('rejects an unknown carryover kind', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({ stretchAndFlow: invalidDetail({ carryover: { kind: 'song', itemIds: [], customText: '' } }) }),
    )
    assert.equal(result.success, false)
  })

  it('rejects a ratio that does not match the selected stage', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({ phaseNumber: 2, stretchAndFlow: invalidDetail({ ratio: 'fiftyFifty' }) }),
    )
    assert.equal(result.success, false)
  })

  it('rejects a phase number that does not match the selected stage', () => {
    const result = sessionSegmentInputSchema.safeParse(segment({ phaseNumber: 3, stretchAndFlow: FULL_DETAIL }))
    assert.equal(result.success, false)
  })

  it('accepts a legacy segment with no stage but a phase number', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({ phaseNumber: 7, stretchAndFlow: invalidDetail({ stageId: null, ratio: null }) }),
    )
    assert.equal(result.success, true)
  })

  it('rejects a ratio with no stage', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({ stretchAndFlow: invalidDetail({ stageId: null, ratio: 'fiftyFifty' }) }),
    )
    assert.equal(result.success, false)
  })
})

describe('breath count field parsing', () => {
  it('keeps an out-of-range value so the field, the stored value, and the error agree', () => {
    const result = parseBreathCountInput('150')
    assert.equal(result.value, 150)
    assert.equal(result.error, 'Enter a breath count between 0 and 100.')
  })

  it('accepts an in-range value with no error', () => {
    assert.deepEqual(parseBreathCountInput('10'), { value: 10, error: null })
  })

  it('treats blank input as not recorded', () => {
    assert.deepEqual(parseBreathCountInput(''), { value: null, error: null })
  })
})

describe('legacy segment normalization', () => {
  it('fills stretchAndFlow with null when the key is absent', () => {
    const legacy: Partial<SessionSegmentInput> = { ...createEmptySegmentInput('stretchAndFlow') }
    delete legacy.stretchAndFlow
    const normalized = normalizeSegmentInput(legacy as SessionSegmentInput)
    assert.equal(normalized.stretchAndFlow, null)
  })

  it('leaves an existing detail untouched', () => {
    const withDetail = segment({ stretchAndFlow: FULL_DETAIL })
    assert.equal(normalizeSegmentInput(withDetail).stretchAndFlow, withDetail.stretchAndFlow)
  })
})

const FULL_PITCH: PitchWorkInput = { highHz: 350, lowHz: 175, speakingRangeLowHz: 165 }
const FULL_RESONANCE: ResonanceDetail = {
  steps: [{ stepId: 'contrastResonance', completed: true }],
  comfortablePitchHz: 180,
  sentenceIds: ['maryMadeMeMad'],
  intonationRepetitions: 3,
}
const FULL_CARRYOVER: CarryoverDetail = {
  conversationCount: 2,
  contextIds: ['peerProgramming'],
  customContext: '',
  warmedUpBefore: true,
}

describe('resonance, pitch, and carryover schema', () => {
  it('accepts a full pitch, resonance, and carryover payload', () => {
    const result = sessionSegmentInputSchema.safeParse(
      segment({ pitch: FULL_PITCH, resonance: FULL_RESONANCE, carryover: FULL_CARRYOVER }),
    )
    assert.equal(result.success, true)
  })

  it('accepts the new details as null', () => {
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ pitch: null, resonance: null, carryover: null })).success, true)
  })

  it('rejects an unknown resonance step id', () => {
    const bad = { ...FULL_RESONANCE, steps: [{ stepId: 'singSong', completed: true }] } as unknown as ResonanceDetail
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ resonance: bad })).success, false)
  })

  it('rejects an unknown sentence id', () => {
    const bad = { ...FULL_RESONANCE, sentenceIds: ['nonexistent'] } as unknown as ResonanceDetail
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ resonance: bad })).success, false)
  })

  it('rejects an unknown carryover context id', () => {
    const bad = { ...FULL_CARRYOVER, contextIds: ['notAContext'] } as unknown as CarryoverDetail
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ carryover: bad })).success, false)
  })

  it('rejects an out-of-range pitch', () => {
    assert.equal(
      sessionSegmentInputSchema.safeParse(segment({ pitch: { ...FULL_PITCH, highHz: 5_000 } })).success,
      false,
    )
  })

  it('accepts a legacy segment with the new keys absent', () => {
    const legacy = segment({}) as Partial<SessionSegmentInput>
    delete legacy.pitch
    delete legacy.resonance
    delete legacy.carryover
    assert.equal(sessionSegmentInputSchema.safeParse(legacy).success, true)
  })
})

describe('note names and normalization', () => {
  it('derives the note name from the frequency, A4 = 440 Hz', () => {
    assert.equal(noteNameForHz(440), 'A4')
    assert.equal(noteNameForHz(349.23), 'F4')
    assert.equal(noteNameForHz(174.61), 'F3')
  })

  it('matches the printed pitch anchors exactly', () => {
    for (const target of VFE_PITCH_TARGETS) assert.equal(noteNameForHz(target.hz), target.noteName)
  })

  it('fills the new keys with null when they are absent', () => {
    const legacy = { ...createEmptySegmentInput('glides') } as Partial<SessionSegmentInput>
    delete legacy.pitch
    delete legacy.resonance
    delete legacy.carryover
    const normalized = normalizeSegmentInput(legacy as SessionSegmentInput)
    assert.equal(normalized.pitch, null)
    assert.equal(normalized.resonance, null)
    assert.equal(normalized.carryover, null)
  })

  it('keeps the empty-detail creators blank', () => {
    assert.deepEqual(createEmptyPitchWork(), { highHz: null, lowHz: null, speakingRangeLowHz: null })
    assert.deepEqual(createEmptyResonanceDetail(), {
      steps: [],
      comfortablePitchHz: null,
      sentenceIds: [],
      intonationRepetitions: null,
    })
    assert.deepEqual(createEmptyCarryoverDetail(), {
      conversationCount: null,
      contextIds: [],
      customContext: '',
      warmedUpBefore: null,
    })
  })
})
