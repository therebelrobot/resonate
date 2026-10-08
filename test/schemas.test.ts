import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sessionSegmentInputSchema } from '../server/schemas'
import {
  createEmptySegmentInput,
  normalizeSegmentInput,
  parseBreathCountInput,
  type SessionSegmentInput,
  type StretchAndFlowDetail,
} from '../shared/model'

function segment(patch: Partial<SessionSegmentInput> = {}): SessionSegmentInput {
  return { ...createEmptySegmentInput('stretchAndFlow'), ...patch }
}

const FULL_DETAIL: StretchAndFlowDetail = {
  stageId: 'phase1',
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
    assert.equal(sessionSegmentInputSchema.safeParse(segment({ phaseNumber: 1, stretchAndFlow: FULL_DETAIL })).success, true)
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
      segment({ phaseNumber: 1, stretchAndFlow: invalidDetail({ ratio: 'fiftyFifty' }) }),
    )
    assert.equal(result.success, false)
  })

  it('rejects a phase number that does not match the selected stage', () => {
    const result = sessionSegmentInputSchema.safeParse(segment({ phaseNumber: 2, stretchAndFlow: FULL_DETAIL }))
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
