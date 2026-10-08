import { useMemo } from 'react'
import { useSessionData } from '../sessionData'
import { DailyMinutesChart, TrendLineChart } from '../components/charts'
import { formatMinutes, formatPercent, formatRating, formatShortDate, formatSigned } from '../format'
import {
  currentStretchAndFlowStage,
  currentStretchAndFlowStageLabel,
  dailyTrend,
  effortShiftSummary,
  glideShareSummary,
  practiceStreakDays,
  protocolHighlights,
  sessionTotalMinutes,
  stretchAndFlowBreathCountTrend,
  stretchAndFlowCarryoverCatalogSizeByKind,
  stretchAndFlowCarryoverProgress,
  stretchAndFlowCueAdherence,
  stretchAndFlowPhaseTimeline,
  stretchAndFlowRatioBreakdown,
  STRETCH_AND_FLOW_CARRYOVER_CATALOG_SIZE,
  topTagsOfKind,
  trackProgress,
} from '../../shared/metrics'
import {
  TRACK_DEFINITIONS,
  PRACTICE_TRACKS,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_RATIO_LABELS,
  STRETCH_AND_FLOW_RATIOS,
  stretchAndFlowStageLabel,
  type PracticeTrack,
} from '../../shared/protocol'
import { TAG_KIND_LABELS, type TagKind } from '../../shared/model'

const TREND_DAYS = 14
const ADHERENCE_DAYS = 28

/** The tallest single-session target in the plan; used as the chart's reference line. */
const TALLEST_SESSION_TARGET = Math.max(...PRACTICE_TRACKS.map((track) => TRACK_DEFINITIONS[track].sessionMinutesTarget))

export function InsightsScreen() {
  const { sessions, tagById, isLoading, loadError } = useSessionData()

  const now = useMemo(() => new Date(), [])
  const progressByTrack = useMemo(() => trackProgress(sessions, now), [sessions, now])
  const streakDays = useMemo(() => practiceStreakDays(sessions, now), [sessions, now])
  const trendPoints = useMemo(() => dailyTrend(sessions, now, TREND_DAYS), [sessions, now])
  const effortShift = useMemo(() => effortShiftSummary(sessions), [sessions])
  const glideShare = useMemo(() => glideShareSummary(sessions), [sessions])
  const highlights = useMemo(() => protocolHighlights(sessions), [sessions])
  const currentStage = useMemo(() => currentStretchAndFlowStage(sessions), [sessions])
  const currentStageLabel = useMemo(() => currentStretchAndFlowStageLabel(sessions), [sessions])
  const phaseTimeline = useMemo(() => stretchAndFlowPhaseTimeline(sessions), [sessions])
  const ratioBreakdown = useMemo(() => stretchAndFlowRatioBreakdown(sessions), [sessions])
  const cueAdherence = useMemo(() => stretchAndFlowCueAdherence(sessions), [sessions])
  const carryoverProgress = useMemo(() => stretchAndFlowCarryoverProgress(sessions), [sessions])
  const breathTrend = useMemo(() => stretchAndFlowBreathCountTrend(sessions), [sessions])
  const carryoverCatalogSize = useMemo(() => stretchAndFlowCarryoverCatalogSizeByKind(), [])

  const topTargets = useMemo(() => topTagsOfKind(sessions, 'focus', tagById, 6), [sessions, tagById])
  const topWins = useMemo(() => topTagsOfKind(sessions, 'win', tagById, 6), [sessions, tagById])
  const topWatchItems = useMemo(() => topTagsOfKind(sessions, 'watch', tagById, 6), [sessions, tagById])

  if (isLoading) return <p className="screen-message">Opening your practice log...</p>
  if (loadError) return <p className="screen-message form-error">{loadError}</p>

  if (highlights.sessionCount === 0) {
    return (
      <div className="screen empty-state">
        <h1>No complete sessions yet</h1>
        <p>
          Insights are built from finished sessions. Drafts do not count toward any of the numbers here, so save a
          session as complete when you are done with it.
        </p>
        <a className="button button-primary" href="#/log">
          Log a session
        </a>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Insights</h1>
        <p className="screen-subtitle">
          {highlights.sessionCount} complete {highlights.sessionCount === 1 ? 'session' : 'sessions'} -{' '}
          {formatMinutes(highlights.totalMinutes)} practiced.
        </p>
      </header>

      <section className="card-row">
        <div className="stat-card">
          <span className="stat-value">{streakDays}</span>
          <span className="stat-label">day streak</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{progressByTrack.vocalFunction.daysPracticedThisWeek}</span>
          <span className="stat-label">VFE days this week</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{formatMinutes(highlights.enduranceMinutes)}</span>
          <span className="stat-label">endurance total</span>
        </div>
      </section>

      <section className="detail-section">
        <h2>This week against the plan</h2>
        {PRACTICE_TRACKS.map((track) => (
          <AdherenceRow key={track} track={track} progress={progressByTrack[track]} />
        ))}
      </section>

      <section className="detail-section">
        <h2>Minutes per day</h2>
        <DailyMinutesChart points={trendPoints} referenceMinutes={TALLEST_SESSION_TARGET} />
      </section>

      <section className="detail-section">
        <h2>Did the work lower the effort?</h2>
        {effortShift.reRatedSessionCount === 0 ? (
          <p className="empty-hint">
            Rate your vocal effort at the end of a session and the before-to-after shift shows up here. It is the one
            number in the log that speaks directly to whether the work is helping.
          </p>
        ) : (
          <div className="card-row">
            <div className="stat-card">
              <span className="stat-value">{formatRating(effortShift.averageBefore)}</span>
              <span className="stat-label">average before</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatRating(effortShift.averageAfter)}</span>
              <span className="stat-label">average after</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatSigned(effortShift.averageChange, 1)}</span>
              <span className="stat-label">
                {effortShift.averageChange !== null && effortShift.averageChange < 0 ? 'easier by' : 'change'}
              </span>
            </div>
          </div>
        )}
        <TrendLineChart
          values={trendPoints.map((point) => point.effortChange)}
          ariaLabel="Change in vocal effort per day"
          lowerIsBetter
        />
      </section>

      <section className="detail-section">
        <h2>Warm-up note</h2>
        <p className="field-hint">The clearest objective signal in the plan: clear vibration, no voice breaks.</p>
        <div className="card-row">
          <div className="stat-card">
            <span className="stat-value">{formatRating(highlights.averageWarmupClarity)}</span>
            <span className="stat-label">average clarity</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatRating(highlights.averageVoiceBreaksPerWarmup)}</span>
            <span className="stat-label">breaks per warm-up</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{highlights.totalVoiceBreaks}</span>
            <span className="stat-label">breaks total</span>
          </div>
        </div>
        <TrendLineChart
          values={trendPoints.map((point) => point.averageWarmupClarity)}
          ariaLabel="Average warm-up vibration clarity per day"
        />
      </section>

      <section className="detail-section">
        <h2>Glides</h2>
        <p className="field-hint">The plan says to spend the most time here, mostly slow and steady.</p>
        <div className="card-row">
          <div className="stat-card">
            <span className="stat-value">{formatPercent(glideShare.glideShare)}</span>
            <span className="stat-label">of VFE time</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatPercent(glideShare.slowPaceShare)}</span>
            <span className="stat-label">at a slow pace</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{formatPercent(glideShare.glideWasLongestShare)}</span>
            <span className="stat-label">longest part</span>
          </div>
        </div>
        {glideShare.glideWasLongestShare !== null && glideShare.glideWasLongestShare < 0.5 && (
          <p className="note-flag">
            Glides were the longest part of the session in under half your VFE sessions. Worth a look, given the plan.
          </p>
        )}
        <p className="field-hint">
          {highlights.totalRegisterShifts} register shifts noticed across {highlights.sessionCount} sessions.
        </p>
      </section>

      <section className="detail-section">
        <h2>POWER</h2>
        <div className="card-row">
          <div className="stat-card">
            <span className="stat-value">{highlights.longestSustainSeconds === null ? '-' : `${highlights.longestSustainSeconds}s`}</span>
            <span className="stat-label">longest sustain</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{highlights.mostNotesClimbed ?? '-'}</span>
            <span className="stat-label">most notes climbed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{highlights.comfortableRangeMarkedCount}</span>
            <span className="stat-label">range markings</span>
          </div>
        </div>
        <TrendLineChart
          values={trendPoints.map((point) => point.longestSustainSeconds)}
          ariaLabel="Longest sustain in seconds per day"
        />
      </section>

      <section className="detail-section">
        <h2>Stretch and Flow</h2>
        <p className="detail-text">
          Currently on {currentStageLabel}
          {highlights.stretchAndFlowPhaseChangeCount > 0
            ? `, with ${highlights.stretchAndFlowPhaseChangeCount} phase ${highlights.stretchAndFlowPhaseChangeCount === 1 ? 'change' : 'changes'} logged.`
            : '. No phase changes logged yet.'}
        </p>
        <p className="field-hint">Average breathing and phonation coordination: {formatRating(highlights.averageCoordination)} of 100.</p>

        <h3>Phase timeline</h3>
        {phaseTimeline.length === 0 ? (
          <p className="empty-hint">No Stretch and Flow stages recorded yet.</p>
        ) : (
          <ul className="tally-list">
            {phaseTimeline.map((span) => (
              <li key={`${span.stageId}-${span.firstSeenAt}`}>
                {/* The label already carries the phase number, so it is not
                    appended again (N2). */}
                <span>{stretchAndFlowStageLabel(span.stageId)}</span>
                <span className="tally-count">
                  {formatShortDate(new Date(span.firstSeenAt))} - {formatShortDate(new Date(span.lastSeenAt))} -{' '}
                  {formatMinutes(span.minutes)} - {span.sessionCount} {span.sessionCount === 1 ? 'session' : 'sessions'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3>Time by voicing ratio</h3>
        <ul className="tally-list">
          {STRETCH_AND_FLOW_RATIOS.map((ratio) => (
            <li key={ratio}>
              <span>{STRETCH_AND_FLOW_RATIO_LABELS[ratio]}</span>
              <span className="tally-count">
                {formatMinutes(ratioBreakdown.minutesByRatio[ratio])} - {ratioBreakdown.sessionCountByRatio[ratio]}{' '}
                {ratioBreakdown.sessionCountByRatio[ratio] === 1 ? 'session' : 'sessions'}
              </span>
            </li>
          ))}
        </ul>

        <h3>Breath count trend</h3>
        <TrendLineChart
          values={breathTrend.map((point) => point.breathCount)}
          ariaLabel="Highest breath count reached per session"
        />

        <h3>Cue adherence</h3>
        {cueAdherence.sessionCount === 0 ? (
          <p className="empty-hint">No cues recorded yet.</p>
        ) : (
          <ul className="tally-list">
            {STRETCH_AND_FLOW_CUES.map((cue) => (
              <li key={cue.id}>
                <span>{cue.text}</span>
                <span className="tally-count">{formatPercent(cueAdherence.shareByCueId[cue.id] ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3>Carryover progress</h3>
        <p className="field-hint">
          {carryoverProgress.practicedItemIds.length} of {STRETCH_AND_FLOW_CARRYOVER_CATALOG_SIZE} catalog items practiced.
        </p>
        <ul className="tally-list">
          {STRETCH_AND_FLOW_CARRYOVER_KINDS.map((kind) => (
            <li key={kind}>
              <span>{STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[kind]}</span>
              <span className="tally-count">
                {carryoverProgress.distinctByKind[kind]} of {carryoverCatalogSize[kind]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <h2>Endurance</h2>
        <div className="card-row">
          <div className="stat-card">
            <span className="stat-value">{formatMinutes(highlights.enduranceMinutes)}</span>
            <span className="stat-label">total</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{highlights.longestEnduranceMinutes === null ? '-' : formatMinutes(highlights.longestEnduranceMinutes)}</span>
            <span className="stat-label">longest single</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{progressByTrack.endurance.daysPracticedThisWeek}/7</span>
            <span className="stat-label">days this week</span>
          </div>
        </div>
        {TRACK_DEFINITIONS.endurance.goalNote && <p className="field-hint">{TRACK_DEFINITIONS.endurance.goalNote}</p>}
      </section>

      <section className="detail-section">
        <h2>Most common tags</h2>
        {(['focus', 'win', 'watch'] as TagKind[]).map((tagKind) => {
          const tallies = tagKind === 'focus' ? topTargets : tagKind === 'win' ? topWins : topWatchItems
          return (
            <div key={tagKind}>
              <p className="field-label">{TAG_KIND_LABELS[tagKind].plural}</p>
              {tallies.length === 0 ? (
                <p className="empty-hint">Nothing tagged yet.</p>
              ) : (
                <ul className="tally-list">
                  {tallies.map((tally) => (
                    <li key={tally.tagId}>
                      <span>{tally.name}</span>
                      <span className="tally-bar-cell">
                        <span className="tally-bar" style={{ width: `${(tally.count / tallies[0]!.count) * 100}%` }} />
                      </span>
                      <span className="tally-count">{tally.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <section className="detail-section">
        <a className="button button-primary" href="#/report">
          Make a report for your SLP
        </a>
      </section>
    </div>
  )
}

function AdherenceRow({
  track,
  progress,
}: {
  track: PracticeTrack
  progress: ReturnType<typeof trackProgress>[PracticeTrack]
}) {
  const definition = TRACK_DEFINITIONS[track]
  const weekTargetText =
    definition.daysPerWeekMinimum === definition.daysPerWeekMaximum
      ? `${definition.daysPerWeekMinimum}`
      : `${definition.daysPerWeekMinimum}-${definition.daysPerWeekMaximum}`

  return (
    <div className="adherence-row">
      <div className="adherence-header">
        <span className="adherence-title">{definition.label}</span>
        <span className={`adherence-days${progress.metWeeklyDayTarget ? ' is-met' : ''}`}>
          {progress.daysPracticedThisWeek} of {weekTargetText} days
        </span>
      </div>
      <p className="field-hint">
        {formatMinutes(progress.minutesThisWeek)} this week, {formatMinutes(progress.minutesLastFourWeeks)} in the last{' '}
        {ADHERENCE_DAYS} days
        {progress.averageSessionMinutes === null ? '' : `, averaging ${formatMinutes(progress.averageSessionMinutes)} a session`}
      </p>
      <p className={progress.metTodayMinutesTarget ? 'form-ok' : 'empty-hint'}>
        Today: {formatMinutes(progress.minutesToday)}
        {progress.metTodayMinutesTarget
          ? ` - past the plan's ${definition.sessionMinutesMinimum} minute floor`
          : ` - ${formatMinutes(progress.minutesShortOfTodayTarget)} to go`}
      </p>
      <p className="field-hint">{definition.cadenceNote}</p>
    </div>
  )
}
