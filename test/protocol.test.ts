import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CARRYOVER_CONTEXTS,
  CARRYOVER_CONTEXT_IDS,
  CARRYOVER_WEEKLY_CONVERSATION_TARGET,
  LAST_STRETCH_AND_FLOW_PHASE,
  PRACTICE_TRACKS,
  PROTOCOL_REFERENCES,
  RESONANCE_SENTENCES,
  RESONANCE_SENTENCE_IDS,
  RESONANCE_STEPS,
  RESONANCE_STEP_IDS,
  SEGMENT_KINDS,
  SEGMENT_TRACK,
  STRETCH_AND_FLOW_CARRYOVER,
  STRETCH_AND_FLOW_CARRYOVER_IDS,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CUE_IDS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_PACING,
  STRETCH_AND_FLOW_PHASE_COUNT,
  STRETCH_AND_FLOW_STAGE_IDS,
  STRETCH_AND_FLOW_STAGES,
  STRETCH_AND_FLOW_STEP_IDS,
  STRETCH_AND_FLOW_STEPS,
  TRACK_DEFINITIONS,
  VFE_PITCH_TARGETS,
} from '../shared/protocol'

describe('stretch and flow protocol integrity', () => {
  it('references only known step ids from every stage', () => {
    const stepIds = new Set(STRETCH_AND_FLOW_STEPS.map((step) => step.id))
    for (const stage of STRETCH_AND_FLOW_STAGES) {
      for (const stepId of stage.stepIds) {
        assert.ok(stepIds.has(stepId), `stage ${stage.id} references unknown step ${stepId}`)
      }
    }
  })

  it('has unique carryover item ids', () => {
    const ids = STRETCH_AND_FLOW_CARRYOVER.map((item) => item.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('has unique cue ids', () => {
    const ids = STRETCH_AND_FLOW_CUES.map((cue) => cue.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('defines the canonical numbered phase set as exactly 1-4', () => {
    const phaseNumbers = STRETCH_AND_FLOW_STAGES.map((stage) => stage.phaseNumber).filter(
      (phaseNumber): phaseNumber is number => phaseNumber !== null,
    )
    assert.deepEqual(phaseNumbers, [1, 2, 3, 4])
    assert.equal(LAST_STRETCH_AND_FLOW_PHASE, 4)
    assert.equal(STRETCH_AND_FLOW_PHASE_COUNT, 4)
  })

  it('gives Phase 1-3 the five-step shape and only Phase 4 the not-printed guidance', () => {
    const byId = new Map(STRETCH_AND_FLOW_STAGES.map((stage) => [stage.id, stage]))
    assert.equal(byId.get('phase1')?.ratio, 'airOnly')
    assert.equal(byId.get('phase2')?.ratio, 'twentyEighty')
    assert.equal(byId.get('phase3')?.ratio, 'fiftyFifty')
    for (const stageId of ['phase1', 'phase2', 'phase3']) {
      const stage = byId.get(stageId)
      assert.ok(stage, `expected a stage ${stageId}`)
      assert.equal(stage.stepsNotPrinted, false)
      assert.equal(stage.stepIds.length, STRETCH_AND_FLOW_STEPS.length)
    }
    const phase4 = byId.get('phase4')
    assert.ok(phase4, 'expected a stage phase4')
    assert.equal(phase4.stepsNotPrinted, true)
    assert.equal(phase4.ratio, null)
    assert.equal(phase4.stepIds.length, 0)
    assert.ok(phase4.guidance.length > 0, 'expected Phase 4 to carry progression guidance')
  })

  it('covers every carryover kind in the catalog', () => {
    const kinds = new Set(STRETCH_AND_FLOW_CARRYOVER.map((item) => item.kind))
    for (const kind of STRETCH_AND_FLOW_CARRYOVER_KINDS) {
      assert.ok(kinds.has(kind), `no catalog items for kind ${kind}`)
    }
  })

  it('keeps the dizziness safety tip in the pacing list', () => {
    assert.ok(STRETCH_AND_FLOW_PACING.some((item) => item.id === 'preventDizziness'))
  })

  it('keeps the id tuples in sync with the object arrays', () => {
    assert.deepEqual([...STRETCH_AND_FLOW_STAGE_IDS], STRETCH_AND_FLOW_STAGES.map((stage) => stage.id))
    assert.deepEqual([...STRETCH_AND_FLOW_STEP_IDS], STRETCH_AND_FLOW_STEPS.map((step) => step.id))
    assert.deepEqual([...STRETCH_AND_FLOW_CUE_IDS], STRETCH_AND_FLOW_CUES.map((cue) => cue.id))
    assert.deepEqual([...STRETCH_AND_FLOW_CARRYOVER_IDS], STRETCH_AND_FLOW_CARRYOVER.map((item) => item.id))
  })

  it('keeps the pacing rationale verbatim from the handout', () => {
    const rationale = STRETCH_AND_FLOW_PACING.find((item) => item.id === 'toggleRationale')
    assert.equal(
      rationale?.text,
      'Remember, the idea is that the patient gets very good at toggling back and forth between the air only productions, and the voiced productions. Spend time either at the very beginning of introducing "air only" to the patient on the "ooo" vowel to toggle back and forth between these two phases without and then with voicing.',
    )
  })
})

describe('resonance and carryover protocol integrity', () => {
  it('keeps the id tuples in sync with the object arrays', () => {
    assert.deepEqual([...RESONANCE_STEP_IDS], RESONANCE_STEPS.map((step) => step.id))
    assert.deepEqual([...RESONANCE_SENTENCE_IDS], RESONANCE_SENTENCES.map((sentence) => sentence.id))
    assert.deepEqual([...CARRYOVER_CONTEXT_IDS], CARRYOVER_CONTEXTS.map((context) => context.id))
  })

  it('has unique ids within each new catalog', () => {
    assert.equal(new Set(RESONANCE_STEPS.map((step) => step.id)).size, RESONANCE_STEPS.length)
    assert.equal(new Set(RESONANCE_SENTENCES.map((sentence) => sentence.id)).size, RESONANCE_SENTENCES.length)
    assert.equal(new Set(PROTOCOL_REFERENCES.map((reference) => reference.id)).size, PROTOCOL_REFERENCES.length)
  })

  it('prints the five sentences from the SLP notes, verbatim', () => {
    assert.deepEqual(
      RESONANCE_SENTENCES.map((sentence) => sentence.text),
      ['Mary made me mad', 'Mother made marmalade', 'Who knows the news', 'William was waiting', 'Where were we Wednesday'],
    )
  })

  it('carries the two pitch anchors as F4 and F3', () => {
    assert.equal(VFE_PITCH_TARGETS.length, 2)
    assert.equal(VFE_PITCH_TARGETS[0]!.noteName, 'F4')
    assert.equal(VFE_PITCH_TARGETS[1]!.noteName, 'F3')
    for (const target of VFE_PITCH_TARGETS) assert.ok(target.hz > 0)
  })

  it('carries both reference links sent by the SLP', () => {
    const urls = PROTOCOL_REFERENCES.map((reference) => reference.url)
    assert.ok(urls.includes('https://acousticgender.space/'))
    assert.ok(urls.some((url) => url.startsWith('https://wiki.sumianvoice.com/')))
  })

  it('asks for the carry-over target the notes give', () => {
    assert.equal(CARRYOVER_WEEKLY_CONVERSATION_TARGET, 2)
  })

  it('maps every segment to a track and defines every track', () => {
    assert.deepEqual(Object.keys(SEGMENT_TRACK).sort(), [...SEGMENT_KINDS].sort())
    assert.deepEqual([...PRACTICE_TRACKS].sort(), Object.keys(TRACK_DEFINITIONS).sort())
    // The two new segments each have their own track (ADR-0003).
    assert.equal(SEGMENT_TRACK.resonance, 'resonance')
    assert.equal(SEGMENT_TRACK.carryover, 'carryover')
  })
})
