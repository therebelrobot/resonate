import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createEmptySegmentInput,
  type CarryoverDetail,
  type PitchWorkInput,
  type ResonanceDetail,
  type Session,
  type SessionSegmentInput,
  type StretchAndFlowDetail,
} from '../shared/model'
import { stretchAndFlowStageLabel, type SegmentKind } from '../shared/protocol'
import {
  carryoverConversationsThisWeek,
  carryoverSummary,
  currentStretchAndFlowStage,
  currentStretchAndFlowStageKey,
  currentStretchAndFlowStageLabel,
  dailyTrend,
  effortShiftSummary,
  glideShareSummary,
  localDayKey,
  minutesByTrack,
  pitchRangeSummary,
  practiceStreakDays,
  protocolHighlights,
  resonanceSummary,
  sessionTotalMinutes,
  stretchAndFlowBreathCountTrend,
  stretchAndFlowCarryoverProgress,
  stretchAndFlowCueAdherence,
  stretchAndFlowPhaseTimeline,
  stretchAndFlowRatioBreakdown,
  stretchAndFlowStepCompletion,
  trackProgress,
} from '../shared/metrics'

let sessionCounter = 0

function segment(kind: SegmentKind, patch: Partial<SessionSegmentInput> = {}): SessionSegmentInput {
  return { ...createEmptySegmentInput(kind), ...patch }
}

/** Noon local time, so day bucketing never straddles a boundary. */
function localNoonIso(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

function session(occurredAt: string, segments: SessionSegmentInput[], patch: Partial<Session> = {}): Session {
  sessionCounter += 1
  return {
    id: `session-${sessionCounter}`,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    status: 'complete',
    role: 'warmup',
    effortBefore: 60,
    effortAfter: 40,
    focusTagIds: [],
    winTagIds: [],
    watchTagIds: [],
    slpNote: '',
    segments,
    ...patch,
  }
}

describe('day keys', () => {
  it('reads the local calendar day off a stored UTC timestamp', () => {
    const date = new Date()
    date.setHours(9, 30, 0, 0)
    const pad = (value: number) => String(value).padStart(2, '0')
    assert.equal(localDayKey(date.toISOString()), `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`)
  })
})

describe('minutes by track', () => {
  it('splits a mixed session across the three tracks', () => {
    const mixed = session(localNoonIso(0), [
      segment('warmupNote', { seconds: 60 }),
      segment('glides', { seconds: 300 }),
      segment('stretchAndFlow', { seconds: 300 }),
      segment('endurance', { seconds: 600 }),
    ])
    const minutes = minutesByTrack(mixed)
    assert.equal(minutes.vocalFunction, 6)
    assert.equal(minutes.stretchAndFlow, 5)
    assert.equal(minutes.endurance, 10)
    assert.equal(sessionTotalMinutes(mixed), 21)
  })

  it('counts the downward POWER pass as vocal function work too', () => {
    const descending = session(localNoonIso(0), [segment('powerDescending', { seconds: 120 })])
    assert.equal(minutesByTrack(descending).vocalFunction, 2)
  })
})

describe('weekly adherence', () => {
  it('counts a day only once the track reaches the plan floor', () => {
    const shortSession = session(localNoonIso(1), [segment('glides', { seconds: 240 })])
    const fullSession = session(localNoonIso(2), [segment('glides', { seconds: 300 })])
    const progress = trackProgress([shortSession, fullSession], new Date())

    // Four minutes of glides is not a day of vocal function exercises; five is.
    assert.equal(progress.vocalFunction.daysPracticedThisWeek, 1)
    assert.equal(progress.vocalFunction.minutesThisWeek, 9)
    assert.equal(progress.vocalFunction.metWeeklyDayTarget, false)
  })

  it('measures today against the per-session floor and reports the gap', () => {
    const today = session(localNoonIso(0), [segment('glides', { seconds: 180 })])
    const progress = trackProgress([today], new Date())
    assert.equal(progress.vocalFunction.minutesToday, 3)
    assert.equal(progress.vocalFunction.metTodayMinutesTarget, false)
    assert.equal(progress.vocalFunction.minutesShortOfTodayTarget, 2)
  })

  it('treats one minute of endurance as a day, because the plan says any amount counts', () => {
    const tiny = session(localNoonIso(0), [segment('endurance', { seconds: 60 })])
    assert.equal(trackProgress([tiny], new Date()).endurance.daysPracticedThisWeek, 1)
  })

  it('ignores drafts entirely', () => {
    const draft = session(localNoonIso(0), [segment('glides', { seconds: 600 })], { status: 'draft' })
    assert.equal(trackProgress([draft], new Date()).vocalFunction.minutesToday, 0)
  })

  it('averages session length for a track that was actually practised', () => {
    const first = session(localNoonIso(1), [segment('glides', { seconds: 300 })])
    const second = session(localNoonIso(2), [segment('glides', { seconds: 900 })])
    assert.equal(trackProgress([first, second], new Date()).vocalFunction.averageSessionMinutes, 10)
  })

  it('leaves out sessions older than the four-week window', () => {
    const ancient = session(localNoonIso(45), [segment('glides', { seconds: 600 })])
    assert.equal(trackProgress([ancient], new Date()).vocalFunction.minutesLastFourWeeks, 0)
  })
})

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    const sessions = [0, 1, 2].map((daysAgo) => session(localNoonIso(daysAgo), [segment('glides', { seconds: 300 })]))
    assert.equal(practiceStreakDays(sessions, new Date()), 3)
  })

  it('does not break the streak just because today is still unlogged', () => {
    const sessions = [1, 2].map((daysAgo) => session(localNoonIso(daysAgo), [segment('glides', { seconds: 300 })]))
    assert.equal(practiceStreakDays(sessions, new Date()), 2)
  })

  it('stops at the first missed day', () => {
    const sessions = [0, 2].map((daysAgo) => session(localNoonIso(daysAgo), [segment('glides', { seconds: 300 })]))
    assert.equal(practiceStreakDays(sessions, new Date()), 1)
  })

  it('is zero when nothing has ever been logged', () => {
    assert.equal(practiceStreakDays([], new Date()), 0)
  })
})

describe('effort shift', () => {
  it('averages the before and after ratings and reports the change', () => {
    const first = session(localNoonIso(1), [], { effortBefore: 60, effortAfter: 40 })
    const second = session(localNoonIso(2), [], { effortBefore: 50, effortAfter: 30 })
    const summary = effortShiftSummary([first, second])
    assert.equal(summary.averageBefore, 55)
    assert.equal(summary.averageAfter, 35)
    assert.equal(summary.averageChange, -20)
    assert.equal(summary.reRatedSessionCount, 2)
  })

  it('reports nothing rather than zero when nothing has been re-rated', () => {
    const unrated = session(localNoonIso(1), [], { effortAfter: null })
    const summary = effortShiftSummary([unrated])
    assert.equal(summary.averageAfter, null)
    assert.equal(summary.averageChange, null)
    assert.equal(summary.reRatedSessionCount, 0)
  })
})

describe('glide share', () => {
  it('measures glide minutes against vocal function minutes', () => {
    const withGlides = session(localNoonIso(1), [
      segment('glides', { seconds: 300, glidePace: 'slow' }),
      segment('powerAscending', { seconds: 60 }),
    ])
    const summary = glideShareSummary([withGlides])
    assert.equal(summary.glideMinutes, 5)
    assert.equal(summary.vocalFunctionMinutes, 6)
    assert.ok(summary.glideShare !== null && Math.abs(summary.glideShare - 5 / 6) < 1e-9)
    assert.equal(summary.slowPaceShare, 1)
    assert.equal(summary.glideWasLongestShare, 1)
    assert.equal(summary.vocalFunctionSessionCount, 1)
  })

  it('flags when glides were not the longest part, which the plan asks them to be', () => {
    const powerLonger = session(localNoonIso(2), [
      segment('glides', { seconds: 120 }),
      segment('powerAscending', { seconds: 600 }),
    ])
    const summary = glideShareSummary([powerLonger])
    assert.equal(summary.glideWasLongestShare, 0)
    assert.ok(summary.slowPaceShare !== null && summary.slowPaceShare === 0)
  })

  it('reports nothing when no vocal function work was logged', () => {
    const enduranceOnly = session(localNoonIso(1), [segment('endurance', { seconds: 900 })])
    const summary = glideShareSummary([enduranceOnly])
    assert.equal(summary.glideShare, null)
    assert.equal(summary.glideWasLongestShare, null)
  })
})

describe('protocol highlights', () => {
  const earlier = session(localNoonIso(2), [
    segment('warmupNote', { seconds: 30, voiceBreaks: 2, clarityRating: 60 }),
    segment('powerAscending', { seconds: 60, longestSustainSeconds: 5, notesClimbed: 5 }),
    segment('stretchAndFlow', { seconds: 300, phaseNumber: 1 }),
  ])
  const later = session(localNoonIso(0), [
    segment('warmupNote', { seconds: 30, voiceBreaks: 0, clarityRating: 90 }),
    segment('powerAscending', { seconds: 90, longestSustainSeconds: 9, notesClimbed: 7 }),
    segment('stretchAndFlow', { seconds: 300, phaseNumber: 2 }),
  ])
  const highlights = protocolHighlights([earlier, later])

  it('takes the current Stretch and Flow phase from the most recent session', () => {
    assert.equal(highlights.currentStretchAndFlowPhase, 2)
    assert.equal(highlights.stretchAndFlowPhaseChangeCount, 1)
  })

  it('keeps the best of each POWER measurement rather than the latest', () => {
    assert.equal(highlights.longestSustainSeconds, 9)
    assert.equal(highlights.mostNotesClimbed, 7)
  })

  it('totals voice breaks and averages warm-up clarity', () => {
    assert.equal(highlights.totalVoiceBreaks, 2)
    assert.equal(highlights.averageWarmupClarity, 75)
    assert.equal(highlights.averageVoiceBreaksPerWarmup, 1)
  })

  it('totals everything practiced', () => {
    assert.equal(highlights.sessionCount, 2)
    assert.equal(highlights.totalMinutes, 13.5)
  })

  it('falls back to phase one when no phase was ever recorded', () => {
    assert.equal(protocolHighlights([session(localNoonIso(0), [segment('glides', { seconds: 300 })])]).currentStretchAndFlowPhase, 1)
  })
})

describe('daily trend', () => {
  it('buckets minutes per day and leaves empty days null rather than zero', () => {
    const today = session(localNoonIso(0), [segment('glides', { seconds: 180, clarityRating: 70 })])
    const trend = dailyTrend([today], new Date(), 3)
    assert.equal(trend.length, 3)
    assert.equal(trend[0]!.vocalFunctionMinutes, 0)
    assert.equal(trend[0]!.averageWarmupClarity, null)
    const lastPoint = trend[2]!
    assert.equal(lastPoint.vocalFunctionMinutes, 3)
    assert.equal(lastPoint.totalMinutes, 3)
  })

  it('averages the effort change for sessions logged on the same day', () => {
    const first = session(localNoonIso(0), [segment('glides', { seconds: 300 })], { effortBefore: 60, effortAfter: 40 })
    const second = session(localNoonIso(0), [segment('glides', { seconds: 300 })], { effortBefore: 40, effortAfter: 30 })
    const trend = dailyTrend([first, second], new Date(), 1)
    assert.equal(trend[0]!.effortChange, -15)
  })
})

function sfDetail(patch: Partial<StretchAndFlowDetail> = {}): StretchAndFlowDetail {
  return {
    stageId: null,
    ratio: null,
    usedTissue: null,
    steps: [],
    cuesChecked: [],
    toggledAirOnlyAndVoiced: null,
    carryover: null,
    ...patch,
  }
}

describe('stretch and flow metrics', () => {
  it('builds contiguous phase spans oldest first', () => {
    const first = session(localNoonIso(3), [
      segment('stretchAndFlow', { seconds: 300, phaseNumber: 1, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) }),
    ])
    const second = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 300, phaseNumber: 1, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) }),
    ])
    const third = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 600, phaseNumber: 2, stretchAndFlow: sfDetail({ stageId: 'phase2' }) }),
    ])
    const spans = stretchAndFlowPhaseTimeline([first, second, third])
    assert.equal(spans.length, 2)
    assert.equal(spans[0]!.stageId, 'phase1')
    assert.equal(spans[0]!.sessionCount, 2)
    assert.equal(spans[0]!.minutes, 10)
    assert.equal(spans[1]!.stageId, 'phase2')
    assert.equal(spans[1]!.minutes, 10)
  })

  it('breaks the span when the stage changes back', () => {
    const a = session(localNoonIso(3), [segment('stretchAndFlow', { seconds: 60, phaseNumber: 1, stretchAndFlow: sfDetail({ stageId: 'phase1' }) })])
    const b = session(localNoonIso(2), [segment('stretchAndFlow', { seconds: 60, phaseNumber: 2, stretchAndFlow: sfDetail({ stageId: 'phase2' }) })])
    const c = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 60, phaseNumber: 1, stretchAndFlow: sfDetail({ stageId: 'phase1' }) })])
    assert.equal(stretchAndFlowPhaseTimeline([a, b, c]).length, 3)
  })

  it('breaks down minutes and sessions by ratio', () => {
    const a = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase2', ratio: 'twentyEighty' }) }),
    ])
    const b = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 600, stretchAndFlow: sfDetail({ stageId: 'phase3', ratio: 'fiftyFifty' }) }),
    ])
    const breakdown = stretchAndFlowRatioBreakdown([a, b])
    assert.equal(breakdown.minutesByRatio.twentyEighty, 5)
    assert.equal(breakdown.minutesByRatio.fiftyFifty, 10)
    assert.equal(breakdown.sessionCountByRatio.twentyEighty, 1)
    assert.equal(breakdown.sessionCountByRatio.airOnly, 0)
  })

  it('computes cue adherence as a share of Stretch sessions', () => {
    const a = session(localNoonIso(2), [segment('stretchAndFlow', { seconds: 60, stretchAndFlow: sfDetail({ cuesChecked: ['elongateVowels'] }) })])
    const b = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 60, stretchAndFlow: sfDetail({ cuesChecked: ['elongateVowels', 'roundLips'] }) }),
    ])
    const adherence = stretchAndFlowCueAdherence([a, b])
    assert.equal(adherence.sessionCount, 2)
    assert.equal(adherence.shareByCueId.elongateVowels, 1)
    assert.equal(adherence.shareByCueId.roundLips, 0.5)
    assert.equal(adherence.shareByCueId.avoidPressedWhisper, 0)
  })

  it('counts step completion per step', () => {
    const a = session(localNoonIso(1), [
      segment('stretchAndFlow', {
        seconds: 60,
        stretchAndFlow: sfDetail({
          steps: [
            { stepId: 'oneNumber', completed: true, breathCount: 10 },
            { stepId: 'twoNumbers', completed: false, breathCount: null },
          ],
        }),
      }),
    ])
    const completion = stretchAndFlowStepCompletion([a])
    assert.equal(completion.sessionCount, 1)
    assert.equal(completion.completedCountByStepId.oneNumber, 1)
    assert.equal(completion.completedCountByStepId.twoNumbers, 0)
  })

  it('counts distinct carryover items and groups them by kind', () => {
    const a = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 60, stretchAndFlow: sfDetail({ carryover: { kind: 'singleWord', itemIds: ['free', 'fine'], customText: '' } }) }),
    ])
    const b = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 60, stretchAndFlow: sfDetail({ carryover: { kind: 'singleWord', itemIds: ['free'], customText: '' } }) }),
    ])
    const progress = stretchAndFlowCarryoverProgress([a, b])
    assert.deepEqual([...progress.practicedItemIds].sort(), ['fine', 'free'])
    assert.equal(progress.countByItemId.free, 2)
    assert.equal(progress.distinctByKind.singleWord, 2)
  })

  it('reports the highest breath count per session, oldest first', () => {
    const a = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 60, stretchAndFlow: sfDetail({ steps: [{ stepId: 'oneNumber', completed: true, breathCount: 8 }] }) }),
    ])
    const b = session(localNoonIso(1), [
      segment('stretchAndFlow', {
        seconds: 60,
        stretchAndFlow: sfDetail({
          steps: [
            { stepId: 'oneNumber', completed: true, breathCount: 10 },
            { stepId: 'twoNumbers', completed: true, breathCount: 6 },
          ],
        }),
      }),
    ])
    const trend = stretchAndFlowBreathCountTrend([a, b])
    assert.equal(trend.length, 2)
    assert.equal(trend[0]!.breathCount, 8)
    assert.equal(trend[1]!.breathCount, 10)
  })

  it('ignores drafts', () => {
    const draft = session(
      localNoonIso(1),
      [segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) })],
      { status: 'draft' },
    )
    assert.equal(stretchAndFlowPhaseTimeline([draft]).length, 0)
    assert.equal(stretchAndFlowRatioBreakdown([draft]).minutesByRatio.twentyEighty, 0)
  })

  it('does not guess a ratio for a legacy row with no recorded ratio', () => {
    const legacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 1 })])
    const breakdown = stretchAndFlowRatioBreakdown([legacy])
    assert.equal(breakdown.minutesByRatio.twentyEighty, 0)
    assert.equal(breakdown.minutesByRatio.airOnly, 0)
    assert.equal(breakdown.minutesByRatio.fiftyFifty, 0)
  })

  it('renders a legacy phase above the canonical set instead of dropping it', () => {
    const legacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 7 })])
    const spans = stretchAndFlowPhaseTimeline([legacy])
    assert.equal(spans.length, 1)
    assert.equal(spans[0]!.stageId, 'legacy-phase-7')
    assert.equal(spans[0]!.phaseNumber, 7)
  })

  it('labels legacy phases by whether they are in the current handout', () => {
    const legacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 2 })])
    assert.equal(stretchAndFlowPhaseTimeline([legacy])[0]!.stageId, 'legacy-phase-2')
    assert.equal(stretchAndFlowStageLabel('legacy-phase-2'), 'Phase 2 (recorded before stages)')
    assert.equal(stretchAndFlowStageLabel('legacy-phase-7'), 'Phase 7 (not in the current handout)')
  })

  it('does not count a zero-minute Stretch part with nothing recorded', () => {
    const empty = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 0 })])
    assert.equal(protocolHighlights([empty]).stretchAndFlowSessionCount, 0)
    assert.equal(stretchAndFlowPhaseTimeline([empty]).length, 0)
  })

  it('counts a zero-minute Stretch part that has a recorded detail', () => {
    const recorded = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 0, stretchAndFlow: sfDetail({ stageId: 'phase2', ratio: 'twentyEighty' }) }),
    ])
    assert.equal(protocolHighlights([recorded]).stretchAndFlowSessionCount, 1)
  })

  it('reports the current stage, preferring the recorded stage over the phase number', () => {
    const phase1 = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) }),
    ])
    assert.equal(currentStretchAndFlowStage([phase1])?.id, 'phase1')
    const legacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 2 })])
    assert.equal(currentStretchAndFlowStage([legacy])?.id, 'phase2')
  })

  it('prefers a newer legacy phase over an older recorded stage', () => {
    const olderRecorded = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase2', ratio: 'twentyEighty' }) }),
    ])
    const newerLegacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 7 })])
    assert.equal(currentStretchAndFlowStageKey([olderRecorded, newerLegacy]), 'legacy-phase-7')
    assert.equal(currentStretchAndFlowStage([olderRecorded, newerLegacy]), undefined)
  })

  it('labels the current stage gracefully, including legacy phases above the canonical set', () => {
    const legacy = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 7 })])
    assert.equal(currentStretchAndFlowStageLabel([legacy]), 'Phase 7 (not in the current handout)')
    const inSet = session(localNoonIso(1), [segment('stretchAndFlow', { seconds: 300, phaseNumber: 2 })])
    assert.equal(currentStretchAndFlowStageLabel([inSet]), 'Phase 2')
    const phase1 = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) }),
    ])
    assert.equal(currentStretchAndFlowStageLabel([phase1]), 'Phase 1')
    assert.equal(currentStretchAndFlowStageLabel([]), 'Phase 1')
  })

  it('counts a change from Phase 1 (Air Only) to Phase 2', () => {
    const phase1 = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 300, stretchAndFlow: sfDetail({ stageId: 'phase1', ratio: 'airOnly' }) }),
    ])
    const phase2 = session(localNoonIso(1), [
      segment('stretchAndFlow', {
        seconds: 300,
        phaseNumber: 2,
        stretchAndFlow: sfDetail({ stageId: 'phase2', ratio: 'twentyEighty' }),
      }),
    ])
    assert.equal(protocolHighlights([phase1, phase2]).stretchAndFlowPhaseChangeCount, 1)
  })

  it('does not count a change when the stage never changes', () => {
    const first = session(localNoonIso(2), [
      segment('stretchAndFlow', { seconds: 300, phaseNumber: 3, stretchAndFlow: sfDetail({ stageId: 'phase3' }) }),
    ])
    const second = session(localNoonIso(1), [
      segment('stretchAndFlow', { seconds: 300, phaseNumber: 3, stretchAndFlow: sfDetail({ stageId: 'phase3' }) }),
    ])
    assert.equal(protocolHighlights([first, second]).stretchAndFlowPhaseChangeCount, 0)
  })

  it('extends protocol highlights with the new Stretch and Flow fields', () => {
    const a = session(localNoonIso(1), [
      segment('stretchAndFlow', {
        seconds: 300,
        phaseNumber: 1,
        stretchAndFlow: sfDetail({
          stageId: 'phase1',
          ratio: 'twentyEighty',
          steps: [{ stepId: 'oneNumber', completed: true, breathCount: 10 }],
          cuesChecked: ['elongateVowels'],
          carryover: { kind: 'singleWord', itemIds: ['free'], customText: '' },
        }),
      }),
    ])
    const highlights = protocolHighlights([a])
    assert.equal(highlights.stretchAndFlowMinutes, 5)
    assert.equal(highlights.stretchAndFlowSessionCount, 1)
    assert.equal(highlights.averageStretchAndFlowBreathCount, 10)
    assert.equal(highlights.stretchAndFlowCarryoverItemCount, 1)
    assert.ok(highlights.stretchAndFlowCueAdherence !== null)
  })
})

function pitchWork(patch: Partial<PitchWorkInput> = {}): PitchWorkInput {
  return { highHz: null, lowHz: null, speakingRangeLowHz: null, ...patch }
}

function resonanceDetail(patch: Partial<ResonanceDetail> = {}): ResonanceDetail {
  return { steps: [], comfortablePitchHz: null, sentenceIds: [], intonationRepetitions: null, ...patch }
}

function carryoverDetail(patch: Partial<CarryoverDetail> = {}): CarryoverDetail {
  return { conversationCount: null, contextIds: [], customContext: '', warmedUpBefore: null, ...patch }
}

describe('resonance, carryover, and pitch metrics', () => {
  it('splits resonance and carryover minutes into their own tracks', () => {
    const mixed = session(localNoonIso(0), [
      segment('resonance', { seconds: 300 }),
      segment('carryover', { seconds: 600 }),
    ])
    const minutes = minutesByTrack(mixed)
    assert.equal(minutes.resonance, 5)
    assert.equal(minutes.carryover, 10)
  })

  it('summarizes resonance: sentences, ladder rung, pitch, and repetitions', () => {
    const withDetail = session(localNoonIso(1), [
      segment('resonance', {
        seconds: 300,
        resonance: resonanceDetail({
          steps: [
            { stepId: 'contrastResonance', completed: true },
            { stepId: 'humming', completed: true },
          ],
          comfortablePitchHz: 180,
          sentenceIds: ['maryMadeMeMad'],
          intonationRepetitions: 3,
        }),
      }),
    ])
    const summary = resonanceSummary([withDetail])
    assert.equal(summary.minutes, 5)
    assert.equal(summary.sessionCount, 1)
    assert.deepEqual(summary.sentenceIdsPractised, ['maryMadeMeMad'])
    assert.equal(summary.latestTopStepId, 'humming')
    assert.equal(summary.averageComfortablePitchHz, 180)
    assert.equal(summary.totalIntonationRepetitions, 3)
  })

  it('reports the highest rung completed from the most recent session', () => {
    const older = session(localNoonIso(2), [
      segment('resonance', {
        seconds: 60,
        resonance: resonanceDetail({
          steps: [
            { stepId: 'contrastResonance', completed: true },
            { stepId: 'intonation', completed: true },
          ],
        }),
      }),
    ])
    const newer = session(localNoonIso(1), [
      segment('resonance', {
        seconds: 60,
        resonance: resonanceDetail({ steps: [{ stepId: 'contrastResonance', completed: true }] }),
      }),
    ])
    assert.equal(resonanceSummary([older, newer]).latestTopStepId, 'contrastResonance')
  })

  it('summarizes carryover: conversations, contexts, and warm-ups', () => {
    const withDetail = session(localNoonIso(1), [
      segment('carryover', {
        seconds: 300,
        carryover: carryoverDetail({ conversationCount: 2, contextIds: ['peerProgramming'], warmedUpBefore: true }),
      }),
    ])
    const summary = carryoverSummary([withDetail])
    assert.equal(summary.minutes, 5)
    assert.equal(summary.conversationTotal, 2)
    assert.deepEqual(summary.contextIdsUsed, ['peerProgramming'])
    assert.equal(summary.warmedUpSessionCount, 1)
  })

  it('counts carryover conversations in the trailing week only', () => {
    const recent = session(localNoonIso(1), [
      segment('carryover', { seconds: 60, carryover: carryoverDetail({ conversationCount: 2 }) }),
    ])
    const old = session(localNoonIso(10), [
      segment('carryover', { seconds: 60, carryover: carryoverDetail({ conversationCount: 3 }) }),
    ])
    assert.equal(carryoverConversationsThisWeek([recent, old], new Date()), 2)
  })

  it('reports the highest, lowest, and latest speaking-range low pitch', () => {
    const older = session(localNoonIso(2), [
      segment('glides', { seconds: 60, pitch: pitchWork({ highHz: 340, lowHz: 170, speakingRangeLowHz: 160 }) }),
    ])
    const newer = session(localNoonIso(1), [
      segment('powerAscending', { seconds: 60, pitch: pitchWork({ highHz: 360, lowHz: 165, speakingRangeLowHz: 155 }) }),
    ])
    const pitch = pitchRangeSummary([older, newer])
    assert.equal(pitch.highestHz, 360)
    assert.equal(pitch.lowestHz, 165)
    assert.equal(pitch.latestSpeakingRangeLowHz, 155)
  })

  it('extends protocol highlights with the resonance, carryover, and pitch fields', () => {
    const withDetail = session(localNoonIso(1), [
      segment('resonance', {
        seconds: 300,
        resonance: resonanceDetail({
          steps: [{ stepId: 'contrastResonance', completed: true }],
          comfortablePitchHz: 180,
          sentenceIds: ['maryMadeMeMad'],
        }),
      }),
      segment('carryover', {
        seconds: 300,
        carryover: carryoverDetail({ conversationCount: 2, contextIds: ['peerProgramming'] }),
      }),
      segment('glides', { seconds: 300, pitch: pitchWork({ highHz: 350, lowHz: 175 }) }),
    ])
    const highlights = protocolHighlights([withDetail])
    assert.equal(highlights.resonanceMinutes, 5)
    assert.equal(highlights.resonanceSessionCount, 1)
    assert.equal(highlights.resonanceSentenceCount, 1)
    assert.equal(highlights.resonanceTopStepId, 'contrastResonance')
    assert.equal(highlights.averageResonancePitchHz, 180)
    assert.equal(highlights.carryoverMinutes, 5)
    assert.equal(highlights.carryoverConversationTotal, 2)
    assert.equal(highlights.carryoverContextCount, 1)
    assert.equal(highlights.highestPitchHz, 350)
    assert.equal(highlights.lowestPitchHz, 175)
  })

  it('ignores drafts for the new metrics', () => {
    const draft = session(
      localNoonIso(1),
      [segment('resonance', { seconds: 300, resonance: resonanceDetail({ sentenceIds: ['maryMadeMeMad'] }) })],
      { status: 'draft' },
    )
    assert.equal(resonanceSummary([draft]).sessionCount, 0)
    assert.equal(carryoverSummary([draft]).sessionCount, 0)
  })

  it('does not count a zero-minute part with nothing recorded', () => {
    const empty = session(localNoonIso(1), [segment('resonance', { seconds: 0 }), segment('carryover', { seconds: 0 })])
    assert.equal(resonanceSummary([empty]).sessionCount, 0)
    assert.equal(carryoverSummary([empty]).sessionCount, 0)
  })
})
