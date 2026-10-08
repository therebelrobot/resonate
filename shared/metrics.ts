import {
  FIRST_STRETCH_AND_FLOW_PHASE,
  GLIDE_SEGMENT_KIND,
  PRACTICE_TRACKS,
  SEGMENT_TRACK,
  STRETCH_AND_FLOW_CARRYOVER,
  STRETCH_AND_FLOW_CARRYOVER_BY_ID,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_RATIOS,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  STRETCH_AND_FLOW_STEPS,
  TRACK_DEFINITIONS,
  stretchAndFlowStageForPhaseNumber,
  stretchAndFlowStageLabel,
  type PracticeTrack,
  type SegmentKind,
  type StretchAndFlowCarryoverKind,
  type StretchAndFlowRatio,
  type StretchAndFlowStage,
} from './protocol'
import type { Session, SessionSegmentInput, Tag, TagKind } from './model'

export const WEEK_DAY_COUNT = 7
export const MONTH_WINDOW_DAY_COUNT = 28

export function addDays(date: Date, dayCount: number): Date {
  const shiftedDate = new Date(date)
  shiftedDate.setDate(shiftedDate.getDate() + dayCount)
  return shiftedDate
}

/** Local wall-clock day key (YYYY-MM-DD) for a Date. */
export function toLocalDayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local wall-clock day key (YYYY-MM-DD) for a stored ISO timestamp. */
export function localDayKey(isoTimestamp: string): string {
  return toLocalDayKey(new Date(isoTimestamp))
}

export function dayKeysEndingAt(referenceDate: Date, dayCount: number): string[] {
  const dayKeys: string[] = []
  for (let daysBack = dayCount - 1; daysBack >= 0; daysBack -= 1) {
    dayKeys.push(toLocalDayKey(addDays(referenceDate, -daysBack)))
  }
  return dayKeys
}

export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

export function maximum(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const firstValue = values[0]
  if (firstValue === undefined) return null
  return values.reduce((largest, value) => (value > largest ? value : largest), firstValue)
}

export type MinutesByTrack = Record<PracticeTrack, number>

export function emptyMinutesByTrack(): MinutesByTrack {
  return { vocalFunction: 0, stretchAndFlow: 0, endurance: 0 }
}

export function minutesByTrack(session: Session): MinutesByTrack {
  const minutes = emptyMinutesByTrack()
  for (const segment of session.segments) minutes[SEGMENT_TRACK[segment.kind]] += segment.seconds / 60
  return minutes
}

export function sessionTotalMinutes(session: Session): number {
  return session.segments.reduce((total, segment) => total + segment.seconds, 0) / 60
}

export function segmentsOfKind(session: Session, kind: SegmentKind): SessionSegmentInput[] {
  return session.segments.filter((segment) => segment.kind === kind)
}

/** Drafts are still being written, so nothing derived from them counts. */
export function isCompleteSession(session: Session): boolean {
  return session.status === 'complete'
}

export function completedSessionsNewestFirst(sessions: readonly Session[]): Session[] {
  return sessions.filter(isCompleteSession).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
}

export function sessionsInRange(sessions: readonly Session[], fromIso: string, toIso: string): Session[] {
  return sessions.filter((session) => session.occurredAt >= fromIso && session.occurredAt <= toIso)
}

export interface DaySummary {
  dayKey: string
  sessionCount: number
  minutesByTrack: MinutesByTrack
  totalMinutes: number
}

export function summarizeDays(sessions: readonly Session[], referenceDate: Date, dayCount: number): DaySummary[] {
  const dayKeys = dayKeysEndingAt(referenceDate, dayCount)
  const summaryByDayKey = new Map<string, DaySummary>()
  for (const dayKey of dayKeys) {
    summaryByDayKey.set(dayKey, { dayKey, sessionCount: 0, minutesByTrack: emptyMinutesByTrack(), totalMinutes: 0 })
  }
  for (const session of completedSessionsNewestFirst(sessions)) {
    const summary = summaryByDayKey.get(localDayKey(session.occurredAt))
    if (!summary) continue
    summary.sessionCount += 1
    const trackMinutes = minutesByTrack(session)
    for (const track of PRACTICE_TRACKS) summary.minutesByTrack[track] += trackMinutes[track]
    summary.totalMinutes += sessionTotalMinutes(session)
  }
  return dayKeys.map((dayKey) => summaryByDayKey.get(dayKey)!)
}

export interface TrackProgress {
  track: PracticeTrack
  minutesToday: number
  minutesThisWeek: number
  minutesLastFourWeeks: number
  daysPracticedThisWeek: number
  daysPracticedLastFourWeeks: number
  sessionCountThisWeek: number
  averageSessionMinutes: number | null
  metTodayMinutesTarget: boolean
  metWeeklyDayTarget: boolean
  /** Minutes still needed today to reach the plan's floor for one session. */
  minutesShortOfTodayTarget: number
}

/**
 * One pass over the trailing four weeks, grouped per day per track.
 * A day counts toward the weekly day target once the track reaches
 * `dayCountsAtMinutes` that day - see the note on that field in protocol.ts.
 */
export function trackProgress(sessions: readonly Session[], referenceDate: Date): Record<PracticeTrack, TrackProgress> {
  const todayKey = toLocalDayKey(referenceDate)
  const fourWeekStartKey = toLocalDayKey(addDays(referenceDate, -(MONTH_WINDOW_DAY_COUNT - 1)))
  const weekStartKey = toLocalDayKey(addDays(referenceDate, -(WEEK_DAY_COUNT - 1)))

  const minutesPerDayByTrack: Record<PracticeTrack, Map<string, number>> = {
    vocalFunction: new Map(),
    stretchAndFlow: new Map(),
    endurance: new Map(),
  }
  const sessionMinutesByTrack: Record<PracticeTrack, number[]> = {
    vocalFunction: [],
    stretchAndFlow: [],
    endurance: [],
  }
  const sessionCountThisWeekByTrack: Record<PracticeTrack, number> = {
    vocalFunction: 0,
    stretchAndFlow: 0,
    endurance: 0,
  }

  for (const session of completedSessionsNewestFirst(sessions)) {
    const dayKey = localDayKey(session.occurredAt)
    if (dayKey < fourWeekStartKey || dayKey > todayKey) continue
    const trackMinutes = minutesByTrack(session)
    for (const track of PRACTICE_TRACKS) {
      const minutes = trackMinutes[track]
      if (minutes <= 0) continue
      sessionMinutesByTrack[track].push(minutes)
      const minutesPerDay = minutesPerDayByTrack[track]
      minutesPerDay.set(dayKey, (minutesPerDay.get(dayKey) ?? 0) + minutes)
      if (dayKey >= weekStartKey) sessionCountThisWeekByTrack[track] += 1
    }
  }

  const progressByTrack = {} as Record<PracticeTrack, TrackProgress>
  for (const track of PRACTICE_TRACKS) {
    const definition = TRACK_DEFINITIONS[track]
    const minutesPerDay = minutesPerDayByTrack[track]
    let daysPracticedThisWeek = 0
    let daysPracticedLastFourWeeks = 0
    let minutesThisWeek = 0
    let minutesLastFourWeeks = 0
    for (const [dayKey, minutes] of minutesPerDay) {
      if (minutes >= definition.dayCountsAtMinutes) {
        daysPracticedLastFourWeeks += 1
        if (dayKey >= weekStartKey) daysPracticedThisWeek += 1
      }
      minutesLastFourWeeks += minutes
      if (dayKey >= weekStartKey) minutesThisWeek += minutes
    }
    const minutesToday = minutesPerDay.get(todayKey) ?? 0
    progressByTrack[track] = {
      track,
      minutesToday,
      minutesThisWeek,
      minutesLastFourWeeks,
      daysPracticedThisWeek,
      daysPracticedLastFourWeeks,
      sessionCountThisWeek: sessionCountThisWeekByTrack[track],
      averageSessionMinutes: average(sessionMinutesByTrack[track]),
      metTodayMinutesTarget: minutesToday >= definition.sessionMinutesMinimum,
      metWeeklyDayTarget: daysPracticedThisWeek >= definition.daysPerWeekMinimum,
      minutesShortOfTodayTarget: Math.max(0, definition.sessionMinutesMinimum - minutesToday),
    }
  }
  return progressByTrack
}

/**
 * Consecutive days with at least one completed session. Today does not break the
 * streak until it is over, so the number stays stable during the day.
 */
export function practiceStreakDays(sessions: readonly Session[], referenceDate: Date): number {
  const practicedDayKeys = new Set(completedSessionsNewestFirst(sessions).map((session) => localDayKey(session.occurredAt)))
  let cursor = referenceDate
  if (!practicedDayKeys.has(toLocalDayKey(cursor))) cursor = addDays(cursor, -1)
  let streakDays = 0
  while (practicedDayKeys.has(toLocalDayKey(cursor))) {
    streakDays += 1
    cursor = addDays(cursor, -1)
  }
  return streakDays
}

export interface EffortShiftSummary {
  averageBefore: number | null
  averageAfter: number | null
  /** Negative means less effort after the work than before, which is the point. */
  averageChange: number | null
  reRatedSessionCount: number
}

export function effortShiftSummary(sessions: readonly Session[]): EffortShiftSummary {
  const reRatedSessions = completedSessionsNewestFirst(sessions).filter((session) => session.effortAfter !== null)
  const beforeValues = reRatedSessions.map((session) => session.effortBefore)
  const afterValues: number[] = []
  for (const session of reRatedSessions) {
    if (session.effortAfter !== null) afterValues.push(session.effortAfter)
  }
  const averageBefore = average(beforeValues)
  const averageAfter = average(afterValues)
  return {
    averageBefore,
    averageAfter,
    averageChange: averageBefore === null || averageAfter === null ? null : averageAfter - averageBefore,
    reRatedSessionCount: reRatedSessions.length,
  }
}

export interface GlideShareSummary {
  glideMinutes: number
  vocalFunctionMinutes: number
  glideShare: number | null
  slowPaceGlideMinutes: number
  slowPaceShare: number | null
  /** Share of VFE sessions where glides were the longest part (ties count). */
  glideWasLongestShare: number | null
  vocalFunctionSessionCount: number
}

export function glideShareSummary(sessions: readonly Session[]): GlideShareSummary {
  let glideMinutes = 0
  let slowPaceGlideMinutes = 0
  let vocalFunctionMinutes = 0
  let sessionsWhereGlideWasLongest = 0
  let vocalFunctionSessionCount = 0

  for (const session of completedSessionsNewestFirst(sessions)) {
    const vocalFunctionSessionMinutes = minutesByTrack(session).vocalFunction
    if (vocalFunctionSessionMinutes <= 0) continue
    vocalFunctionSessionCount += 1
    vocalFunctionMinutes += vocalFunctionSessionMinutes

    const glideSegments = segmentsOfKind(session, GLIDE_SEGMENT_KIND)
    const glideSeconds = glideSegments.reduce((total, segment) => total + segment.seconds, 0)
    glideMinutes += glideSeconds / 60
    slowPaceGlideMinutes +=
      glideSegments.filter((segment) => segment.glidePace === 'slow').reduce((total, segment) => total + segment.seconds, 0) / 60

    const longestVocalFunctionSeconds = maximum(
      session.segments.filter((segment) => SEGMENT_TRACK[segment.kind] === 'vocalFunction').map((segment) => segment.seconds),
    )
    if (glideSeconds > 0 && longestVocalFunctionSeconds !== null && glideSeconds >= longestVocalFunctionSeconds) {
      sessionsWhereGlideWasLongest += 1
    }
  }

  return {
    glideMinutes,
    vocalFunctionMinutes,
    glideShare: vocalFunctionMinutes > 0 ? glideMinutes / vocalFunctionMinutes : null,
    slowPaceGlideMinutes,
    slowPaceShare: glideMinutes > 0 ? slowPaceGlideMinutes / glideMinutes : null,
    glideWasLongestShare: vocalFunctionSessionCount > 0 ? sessionsWhereGlideWasLongest / vocalFunctionSessionCount : null,
    vocalFunctionSessionCount,
  }
}

export interface ProtocolHighlights {
  sessionCount: number
  totalMinutes: number
  longestSustainSeconds: number | null
  mostNotesClimbed: number | null
  totalRegisterShifts: number
  averageWarmupClarity: number | null
  totalVoiceBreaks: number
  averageVoiceBreaksPerWarmup: number | null
  averageCoordination: number | null
  enduranceMinutes: number
  longestEnduranceMinutes: number | null
  comfortableRangeMarkedCount: number
  currentStretchAndFlowPhase: number
  stretchAndFlowPhaseChangeCount: number
  stretchAndFlowMinutes: number
  stretchAndFlowSessionCount: number
  averageStretchAndFlowBreathCount: number | null
  /** Mean share across cues of Stretch sessions where the cue was checked. */
  stretchAndFlowCueAdherence: number | null
  /** Distinct catalog items practiced, across all sessions. */
  stretchAndFlowCarryoverItemCount: number
}

/** Everything the plan asks you to watch, rolled up over the sessions given. */
export function protocolHighlights(sessions: readonly Session[]): ProtocolHighlights {
  const completeSessions = completedSessionsNewestFirst(sessions)
  const sustainValues: number[] = []
  const notesClimbedValues: number[] = []
  const clarityValues: number[] = []
  const voiceBreakValues: number[] = []
  const coordinationValues: number[] = []
  let totalRegisterShifts = 0
  let enduranceMinutes = 0
  let longestEnduranceMinutes: number | null = null
  let comfortableRangeMarkedCount = 0
  let stretchAndFlowMinutes = 0
  let stretchAndFlowSessionCount = 0
  const stretchAndFlowBreathCounts: number[] = []

  for (const session of completeSessions) {
    let sessionMaxBreathCount: number | null = null
    for (const segment of session.segments) {
      if (segment.longestSustainSeconds !== null) sustainValues.push(segment.longestSustainSeconds)
      if (segment.notesClimbed !== null) notesClimbedValues.push(segment.notesClimbed)
      if (segment.clarityRating !== null) clarityValues.push(segment.clarityRating)
      if (segment.voiceBreaks !== null) voiceBreakValues.push(segment.voiceBreaks)
      if (segment.coordinationRating !== null) coordinationValues.push(segment.coordinationRating)
      if (segment.registerShifts !== null) totalRegisterShifts += segment.registerShifts
      if (segment.identifiedComfortableRange) comfortableRangeMarkedCount += 1
      if (segment.kind === 'endurance') {
        const segmentMinutes = segment.seconds / 60
        enduranceMinutes += segmentMinutes
        if (longestEnduranceMinutes === null || segmentMinutes > longestEnduranceMinutes) {
          longestEnduranceMinutes = segmentMinutes
        }
      }
      if (segment.kind === 'stretchAndFlow') {
        stretchAndFlowMinutes += segment.seconds / 60
        for (const step of segment.stretchAndFlow?.steps ?? []) {
          if (step.breathCount === null) continue
          sessionMaxBreathCount =
            sessionMaxBreathCount === null ? step.breathCount : Math.max(sessionMaxBreathCount, step.breathCount)
        }
      }
    }
    // One value per session: averaging raw counts across steps with different
    // ranges (1-9, 2-10, ...) would compare incompatible numbers.
    if (sessionMaxBreathCount !== null) stretchAndFlowBreathCounts.push(sessionMaxBreathCount)
    if (session.segments.some(isCountedStretchSegment)) stretchAndFlowSessionCount += 1
  }

  const phasesOldestFirst: number[] = []
  for (const session of [...completeSessions].reverse()) {
    const phase = segmentsOfKind(session, 'stretchAndFlow').find((segment) => segment.phaseNumber !== null)?.phaseNumber
    if (typeof phase === 'number') phasesOldestFirst.push(phase)
  }

  // Count changes between recorded stages, not just phase numbers, so moving
  // from the Air Only foundation to Phase 1 counts as a change (N4). A legacy
  // row contributes its `legacy-phase-N` key, so old data still counts.
  const stageKeysOldestFirst: string[] = []
  for (const session of [...completeSessions].reverse()) {
    const stageKey = segmentsOfKind(session, 'stretchAndFlow')
      .map(stretchAndFlowSpanIdOf)
      .find((key): key is string => key !== null)
    if (stageKey) stageKeysOldestFirst.push(stageKey)
  }
  let stretchAndFlowPhaseChangeCount = 0
  for (let index = 1; index < stageKeysOldestFirst.length; index += 1) {
    if (stageKeysOldestFirst[index] !== stageKeysOldestFirst[index - 1]) stretchAndFlowPhaseChangeCount += 1
  }

  const cueAdherence = stretchAndFlowCueAdherence(completeSessions)
  const cueShares = Object.values(cueAdherence.shareByCueId)
  const carryoverProgress = stretchAndFlowCarryoverProgress(completeSessions)

  return {
    sessionCount: completeSessions.length,
    totalMinutes: completeSessions.reduce((total, session) => total + sessionTotalMinutes(session), 0),
    longestSustainSeconds: maximum(sustainValues),
    mostNotesClimbed: maximum(notesClimbedValues),
    totalRegisterShifts,
    averageWarmupClarity: average(clarityValues),
    totalVoiceBreaks: voiceBreakValues.reduce((total, value) => total + value, 0),
    averageVoiceBreaksPerWarmup: average(voiceBreakValues),
    averageCoordination: average(coordinationValues),
    enduranceMinutes,
    longestEnduranceMinutes,
    comfortableRangeMarkedCount,
    currentStretchAndFlowPhase: phasesOldestFirst.at(-1) ?? FIRST_STRETCH_AND_FLOW_PHASE,
    stretchAndFlowPhaseChangeCount,
    stretchAndFlowMinutes,
    stretchAndFlowSessionCount,
    averageStretchAndFlowBreathCount: average(stretchAndFlowBreathCounts),
    stretchAndFlowCueAdherence: cueShares.length === 0 ? null : average(cueShares),
    stretchAndFlowCarryoverItemCount: carryoverProgress.practicedItemIds.length,
  }
}

export interface DailyTrendPoint {
  dayKey: string
  vocalFunctionMinutes: number
  stretchAndFlowMinutes: number
  enduranceMinutes: number
  totalMinutes: number
  averageWarmupClarity: number | null
  voiceBreaks: number | null
  longestSustainSeconds: number | null
  effortChange: number | null
}

export function dailyTrend(sessions: readonly Session[], referenceDate: Date, dayCount: number): DailyTrendPoint[] {
  const dayKeys = dayKeysEndingAt(referenceDate, dayCount)
  const sessionsByDayKey = new Map<string, Session[]>()
  for (const dayKey of dayKeys) sessionsByDayKey.set(dayKey, [])
  for (const session of completedSessionsNewestFirst(sessions)) {
    const daySessions = sessionsByDayKey.get(localDayKey(session.occurredAt))
    if (daySessions) daySessions.push(session)
  }

  return dayKeys.map((dayKey) => {
    const daySessions = sessionsByDayKey.get(dayKey) ?? []
    const minutes = emptyMinutesByTrack()
    for (const session of daySessions) {
      const trackMinutes = minutesByTrack(session)
      for (const track of PRACTICE_TRACKS) minutes[track] += trackMinutes[track]
    }

    const clarityValues: number[] = []
    const voiceBreakValues: number[] = []
    const sustainValues: number[] = []
    const effortChanges: number[] = []
    for (const session of daySessions) {
      for (const segment of segmentsOfKind(session, 'warmupNote')) {
        if (segment.clarityRating !== null) clarityValues.push(segment.clarityRating)
        if (segment.voiceBreaks !== null) voiceBreakValues.push(segment.voiceBreaks)
      }
      for (const segment of session.segments) {
        if (segment.longestSustainSeconds !== null) sustainValues.push(segment.longestSustainSeconds)
      }
      if (session.effortAfter !== null) effortChanges.push(session.effortAfter - session.effortBefore)
    }

    return {
      dayKey,
      vocalFunctionMinutes: minutes.vocalFunction,
      stretchAndFlowMinutes: minutes.stretchAndFlow,
      enduranceMinutes: minutes.endurance,
      totalMinutes: minutes.vocalFunction + minutes.stretchAndFlow + minutes.endurance,
      averageWarmupClarity: average(clarityValues),
      voiceBreaks: voiceBreakValues.length === 0 ? null : voiceBreakValues.reduce((total, value) => total + value, 0),
      longestSustainSeconds: maximum(sustainValues),
      effortChange: average(effortChanges),
    }
  })
}

export function countTagOccurrences(sessions: readonly Session[]): Map<string, number> {
  const countsByTagId = new Map<string, number>()
  const countTag = (tagId: string) => countsByTagId.set(tagId, (countsByTagId.get(tagId) ?? 0) + 1)
  for (const session of sessions) {
    for (const tagId of session.focusTagIds) countTag(tagId)
    for (const tagId of session.winTagIds) countTag(tagId)
    for (const tagId of session.watchTagIds) countTag(tagId)
    for (const segment of session.segments) {
      for (const tagId of segment.tagIds) countTag(tagId)
    }
  }
  return countsByTagId
}

export interface TagTally {
  tagId: string
  name: string
  count: number
}

/** Most-used tags of one kind, for the insights and report rollups. */
export function topTagsOfKind(
  sessions: readonly Session[],
  tagKind: TagKind,
  tagById: Map<string, Tag>,
  limit: number,
): TagTally[] {
  const countsByTagId = countTagOccurrences(sessions)
  const tallies: TagTally[] = []
  for (const [tagId, count] of countsByTagId) {
    const tag = tagById.get(tagId)
    if (!tag || tag.kind !== tagKind) continue
    tallies.push({ tagId, name: tag.name, count })
  }
  return tallies.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)).slice(0, limit)
}

/** Longest single stretch of endurance reading or recording, in minutes. */
export function longestEnduranceMinutes(sessions: readonly Session[]): number | null {
  const enduranceMinutes = completedSessionsNewestFirst(sessions).flatMap((session) =>
    segmentsOfKind(session, 'endurance').map((segment) => segment.seconds / 60),
  )
  return maximum(enduranceMinutes)
}

// ---------------------------------------------------------------------------
// Stretch and Flow metrics (spec 5). Pure functions over stored sessions; no
// new storage. Drafts are ignored, consistent with the rest of this file.
// ---------------------------------------------------------------------------

/**
 * A Stretch segment counts when it has time on it or a recorded detail. A
 * zero-minute placeholder with nothing recorded is not a session, consistent
 * with trackProgress().
 */
function isCountedStretchSegment(segment: SessionSegmentInput): boolean {
  return segment.kind === 'stretchAndFlow' && (segment.seconds > 0 || segment.stretchAndFlow !== null)
}

/**
 * The span id for a Stretch segment. A recorded stage uses its catalog id; a
 * legacy row (no stageId) uses `legacy-phase-N` so it still renders instead of
 * being dropped (ADR-0001).
 */
function stretchAndFlowSpanIdOf(segment: SessionSegmentInput): string | null {
  const detail = segment.stretchAndFlow
  if (detail?.stageId) return detail.stageId
  if (segment.phaseNumber !== null) return `legacy-phase-${segment.phaseNumber}`
  return null
}

/**
 * The ratio recorded for a Stretch segment. Only `detail.ratio` counts: a legacy
 * row has no recorded ratio, so it must not be guessed from its phase number.
 */
function stretchAndFlowRatioOf(segment: SessionSegmentInput): StretchAndFlowRatio | null {
  return segment.stretchAndFlow?.ratio ?? null
}

/** Complete sessions that carry a counted Stretch and Flow segment. */
function stretchAndFlowSessions(sessions: readonly Session[]): Session[] {
  return completedSessionsNewestFirst(sessions).filter((session) => session.segments.some(isCountedStretchSegment))
}

/**
 * The stage key the user is currently on: a catalog stage id, `legacy-phase-N`
 * for a legacy row, or null when nothing has been recorded. The newest session
 * wins, so a newer legacy phase number is not shadowed by an older recorded
 * stage (N8).
 */
export function currentStretchAndFlowStageKey(sessions: readonly Session[]): string | null {
  for (const session of completedSessionsNewestFirst(sessions)) {
    const stageKey = segmentsOfKind(session, 'stretchAndFlow')
      .map(stretchAndFlowSpanIdOf)
      .find((key): key is string => key !== null)
    if (stageKey) return stageKey
  }
  return null
}

/**
 * The stage the user is currently on, for Today/Insights/Report. A recorded
 * stage resolves to its catalog entry; a legacy phase number within the
 * canonical set resolves to that stage, and one above it resolves to undefined
 * (ADR-0001). This is the logic Today already used, shared so the screens agree.
 */
export function currentStretchAndFlowStage(sessions: readonly Session[]): StretchAndFlowStage | undefined {
  const stageKey = currentStretchAndFlowStageKey(sessions)
  if (!stageKey) return undefined
  const stage = STRETCH_AND_FLOW_STAGE_BY_ID.get(stageKey)
  if (stage) return stage
  const legacyMatch = /^legacy-phase-(\d+)$/.exec(stageKey)
  return legacyMatch ? stretchAndFlowStageForPhaseNumber(Number(legacyMatch[1])) : undefined
}

/**
 * Display label for the stage the user is currently on. A recorded stage uses
 * its catalog label; a legacy phase number renders through
 * stretchAndFlowStageLabel so a value above the canonical set reads "Phase N
 * (not in the current handout)" rather than a bare number (N3, ADR-0001).
 * Falls back to the default phase label when nothing has been recorded.
 */
export function currentStretchAndFlowStageLabel(sessions: readonly Session[]): string {
  const stage = currentStretchAndFlowStage(sessions)
  if (stage) return stage.label
  const stageKey = currentStretchAndFlowStageKey(sessions)
  if (stageKey) return stretchAndFlowStageLabel(stageKey)
  return `Phase ${FIRST_STRETCH_AND_FLOW_PHASE}`
}

export interface StretchAndFlowPhaseSpan {
  stageId: string
  phaseNumber: number | null
  firstSeenAt: string
  lastSeenAt: string
  sessionCount: number
  minutes: number
}

/** Time-in-phase: contiguous spans of the same stage, oldest first. */
export function stretchAndFlowPhaseTimeline(sessions: readonly Session[]): StretchAndFlowPhaseSpan[] {
  const spans: StretchAndFlowPhaseSpan[] = []
  for (const session of [...completedSessionsNewestFirst(sessions)].reverse()) {
    const stretchSegments = segmentsOfKind(session, 'stretchAndFlow')
    const spanId = stretchSegments.map(stretchAndFlowSpanIdOf).find((id): id is string => id !== null)
    if (!spanId) continue
    const minutes = stretchSegments.reduce((total, segment) => total + segment.seconds, 0) / 60
    const stage = STRETCH_AND_FLOW_STAGE_BY_ID.get(spanId)
    const legacyMatch = /^legacy-phase-(\d+)$/.exec(spanId)
    const phaseNumber = stage?.phaseNumber ?? (legacyMatch ? Number(legacyMatch[1]) : null)
    const lastSpan = spans.at(-1)
    if (lastSpan && lastSpan.stageId === spanId) {
      lastSpan.lastSeenAt = session.occurredAt
      lastSpan.sessionCount += 1
      lastSpan.minutes += minutes
    } else {
      spans.push({
        stageId: spanId,
        phaseNumber,
        firstSeenAt: session.occurredAt,
        lastSeenAt: session.occurredAt,
        sessionCount: 1,
        minutes,
      })
    }
  }
  return spans
}

export interface StretchAndFlowRatioBreakdown {
  minutesByRatio: Record<StretchAndFlowRatio, number>
  sessionCountByRatio: Record<StretchAndFlowRatio, number>
}

export function stretchAndFlowRatioBreakdown(sessions: readonly Session[]): StretchAndFlowRatioBreakdown {
  const minutesByRatio = { airOnly: 0, twentyEighty: 0, fiftyFifty: 0 } as Record<StretchAndFlowRatio, number>
  const sessionCountByRatio = { airOnly: 0, twentyEighty: 0, fiftyFifty: 0 } as Record<StretchAndFlowRatio, number>
  for (const session of stretchAndFlowSessions(sessions)) {
    const seenRatios = new Set<StretchAndFlowRatio>()
    for (const segment of segmentsOfKind(session, 'stretchAndFlow')) {
      const ratio = stretchAndFlowRatioOf(segment)
      if (!ratio) continue
      minutesByRatio[ratio] += segment.seconds / 60
      seenRatios.add(ratio)
    }
    for (const ratio of seenRatios) sessionCountByRatio[ratio] += 1
  }
  return { minutesByRatio, sessionCountByRatio }
}

export interface StretchAndFlowCueAdherence {
  /** cue id -> share of Stretch sessions where it was checked. */
  shareByCueId: Record<string, number>
  sessionCount: number
}

export function stretchAndFlowCueAdherence(sessions: readonly Session[]): StretchAndFlowCueAdherence {
  const stretchSessions = stretchAndFlowSessions(sessions).filter((session) =>
    segmentsOfKind(session, 'stretchAndFlow').some((segment) => segment.stretchAndFlow !== null),
  )
  const checkedCountByCueId: Record<string, number> = {}
  for (const cue of STRETCH_AND_FLOW_CUES) checkedCountByCueId[cue.id] = 0
  for (const session of stretchSessions) {
    const checked = new Set<string>()
    for (const segment of segmentsOfKind(session, 'stretchAndFlow')) {
      for (const cueId of segment.stretchAndFlow?.cuesChecked ?? []) checked.add(cueId)
    }
    for (const cueId of checked) {
      if (cueId in checkedCountByCueId) checkedCountByCueId[cueId] = (checkedCountByCueId[cueId] ?? 0) + 1
    }
  }
  const shareByCueId: Record<string, number> = {}
  for (const cue of STRETCH_AND_FLOW_CUES) {
    shareByCueId[cue.id] = stretchSessions.length === 0 ? 0 : checkedCountByCueId[cue.id]! / stretchSessions.length
  }
  return { shareByCueId, sessionCount: stretchSessions.length }
}

export interface StretchAndFlowStepCompletion {
  /** step id -> number of sessions where it was completed. */
  completedCountByStepId: Record<string, number>
  sessionCount: number
}

export function stretchAndFlowStepCompletion(sessions: readonly Session[]): StretchAndFlowStepCompletion {
  const stretchSessions = stretchAndFlowSessions(sessions).filter((session) =>
    segmentsOfKind(session, 'stretchAndFlow').some((segment) => segment.stretchAndFlow !== null),
  )
  const completedCountByStepId: Record<string, number> = {}
  for (const step of STRETCH_AND_FLOW_STEPS) completedCountByStepId[step.id] = 0
  for (const session of stretchSessions) {
    const completed = new Set<string>()
    for (const segment of segmentsOfKind(session, 'stretchAndFlow')) {
      for (const step of segment.stretchAndFlow?.steps ?? []) {
        if (step.completed) completed.add(step.stepId)
      }
    }
    for (const stepId of completed) {
      if (stepId in completedCountByStepId) completedCountByStepId[stepId] = (completedCountByStepId[stepId] ?? 0) + 1
    }
  }
  return { completedCountByStepId, sessionCount: stretchSessions.length }
}

export interface StretchAndFlowCarryoverProgress {
  /** distinct catalog item ids practiced, across all sessions. */
  practicedItemIds: string[]
  /** catalog item id -> session count. */
  countByItemId: Record<string, number>
  /** kind -> distinct items practiced. */
  distinctByKind: Record<StretchAndFlowCarryoverKind, number>
}

export function stretchAndFlowCarryoverProgress(sessions: readonly Session[]): StretchAndFlowCarryoverProgress {
  const countByItemId: Record<string, number> = {}
  const distinctByKind = {} as Record<StretchAndFlowCarryoverKind, number>
  for (const kind of STRETCH_AND_FLOW_CARRYOVER_KINDS) distinctByKind[kind] = 0
  for (const session of stretchAndFlowSessions(sessions)) {
    const itemIds = new Set<string>()
    for (const segment of segmentsOfKind(session, 'stretchAndFlow')) {
      for (const itemId of segment.stretchAndFlow?.carryover?.itemIds ?? []) itemIds.add(itemId)
    }
    for (const itemId of itemIds) countByItemId[itemId] = (countByItemId[itemId] ?? 0) + 1
  }
  const practicedItemIds = Object.keys(countByItemId)
  for (const itemId of practicedItemIds) {
    const item = STRETCH_AND_FLOW_CARRYOVER_BY_ID.get(itemId)
    if (item) distinctByKind[item.kind] += 1
  }
  return { practicedItemIds, countByItemId, distinctByKind }
}

/** Highest breath count reached per session, oldest first, for a trend line. */
export function stretchAndFlowBreathCountTrend(
  sessions: readonly Session[],
): { occurredAt: string; breathCount: number | null }[] {
  return [...completedSessionsNewestFirst(sessions)].reverse().map((session) => {
    const breathCounts: number[] = []
    for (const segment of segmentsOfKind(session, 'stretchAndFlow')) {
      for (const step of segment.stretchAndFlow?.steps ?? []) {
        if (step.breathCount !== null) breathCounts.push(step.breathCount)
      }
    }
    return { occurredAt: session.occurredAt, breathCount: maximum(breathCounts) }
  })
}

/** Catalog size per kind, for coverage counts in the UI. */
export function stretchAndFlowCarryoverCatalogSizeByKind(): Record<StretchAndFlowCarryoverKind, number> {
  const sizeByKind = {} as Record<StretchAndFlowCarryoverKind, number>
  for (const kind of STRETCH_AND_FLOW_CARRYOVER_KINDS) sizeByKind[kind] = 0
  for (const item of STRETCH_AND_FLOW_CARRYOVER) sizeByKind[item.kind] += 1
  return sizeByKind
}

/** Total catalog size, for a single coverage figure. */
export const STRETCH_AND_FLOW_CARRYOVER_CATALOG_SIZE = STRETCH_AND_FLOW_CARRYOVER.length
