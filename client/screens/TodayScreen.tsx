import { useMemo } from 'react'
import { useSessionData } from '../sessionData'
import { formatMinutes, formatTime } from '../format'
import {
  currentStretchAndFlowStage,
  currentStretchAndFlowStageKey,
  currentStretchAndFlowStageLabel,
  localDayKey,
  minutesByTrack,
  practiceStreakDays,
  protocolHighlights,
  sessionTotalMinutes,
  trackProgress,
} from '../../shared/metrics'
import {
  PRACTICE_TRACKS,
  SEGMENT_TRACK,
  STRETCH_AND_FLOW_CUES,
  TRACK_DEFINITIONS,
  type PracticeTrack,
} from '../../shared/protocol'
import { SESSION_ROLE_LABELS } from '../../shared/model'

export function TodayScreen() {
  const { sessions, isLoading, loadError } = useSessionData()
  const now = new Date()

  const progressByTrack = useMemo(() => trackProgress(sessions, now), [sessions])
  const streakDays = useMemo(() => practiceStreakDays(sessions, now), [sessions])
  const highlights = useMemo(() => protocolHighlights(sessions), [sessions])
  const todaysSessions = useMemo(
    () => sessions.filter((session) => localDayKey(session.occurredAt) === localDayKey(now.toISOString())),
    [sessions],
  )

  // The most recent complete Stretch and Flow detail, for today's checklist.
  const latestStretchDetail = useMemo(() => {
    const latestSegment = [...sessions]
      .filter((session) => session.status === 'complete')
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .flatMap((session) => session.segments)
      .find((segment) => segment.kind === 'stretchAndFlow' && segment.stretchAndFlow !== null)
    return latestSegment?.stretchAndFlow ?? null
  }, [sessions])

  const currentStage = useMemo(() => currentStretchAndFlowStage(sessions), [sessions])
  const currentStageKey = useMemo(() => currentStretchAndFlowStageKey(sessions), [sessions])
  const currentStageLabel = useMemo(() => currentStretchAndFlowStageLabel(sessions), [sessions])

  if (isLoading) return <p className="screen-message">Opening your practice log...</p>
  if (loadError) return <p className="screen-message form-error">{loadError}</p>

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Today</h1>
        <p className="screen-subtitle">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          {streakDays > 0 && ` - ${streakDays} day${streakDays === 1 ? '' : 's'} in a row`}
        </p>
      </header>

      <a className="button button-primary button-block" href="#/log">
        {todaysSessions.length === 0 ? "Start today's practice" : 'Log another session'}
      </a>

      <section className="card-stack" aria-label="Today against the plan">
        {PRACTICE_TRACKS.map((track) => (
          <TrackProgressCard key={track} track={track} progress={progressByTrack[track]} />
        ))}
      </section>

      <section className="screen-section">
        <h2>Stretch and Flow phase</h2>
        <p className="helper">
          You are on <strong>{currentStageLabel}</strong>
          {currentStage?.ratioLabel ? ` - ${currentStage.ratioLabel}` : ''}
          {highlights.stretchAndFlowPhaseChangeCount > 0
            ? ` (changed ${highlights.stretchAndFlowPhaseChangeCount} time${highlights.stretchAndFlowPhaseChangeCount === 1 ? '' : 's'} so far).`
            : currentStageKey === null || currentStageKey === 'airOnly'
              ? ' (the Air Only foundation is the starting point in the plan).'
              : ' (no phase changes logged yet).'}
        </p>
        {latestStretchDetail && latestStretchDetail.steps.length > 0 && (
          <p className="field-hint">
            Last session: {latestStretchDetail.steps.filter((step) => step.completed).length} of{' '}
            {latestStretchDetail.steps.length} steps done, {latestStretchDetail.cuesChecked.length} of{' '}
            {STRETCH_AND_FLOW_CUES.length} cues checked.
          </p>
        )}
        <a className="link-button" href="#/protocol">
          Read the plan and add phase notes
        </a>
      </section>

      {todaysSessions.length > 0 && (
        <section className="screen-section">
          <h2>Logged today</h2>
          <ul className="session-list">
            {todaysSessions.map((session) => (
              <li key={session.id}>
                <article className="session-card">
                  <a className="session-card-link" href={`#/sessions/${session.id}`}>
                    <span className="session-card-time">
                      {formatTime(session.occurredAt)}
                      {session.status === 'draft' && <span className="badge-draft">Draft</span>}
                    </span>
                    <span className="session-card-parts">
                      {SESSION_ROLE_LABELS[session.role]} - {formatMinutes(sessionTotalMinutes(session))}
                    </span>
                  </a>
                  <div className="session-card-tags">
                    {PRACTICE_TRACKS.filter((track) => minutesByTrack(session)[track] > 0).map((track) => (
                      <span key={track} className="mini-chip">
                        {TRACK_DEFINITIONS[track].shortLabel} {formatMinutes(minutesByTrack(session)[track])}
                      </span>
                    ))}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function TrackProgressCard({
  track,
  progress,
}: {
  track: PracticeTrack
  progress: ReturnType<typeof trackProgress>[PracticeTrack]
}) {
  const definition = TRACK_DEFINITIONS[track]
  const targetMinutes = definition.sessionMinutesTarget
  const fillFraction = targetMinutes > 0 ? Math.min(progress.minutesToday / targetMinutes, 1) : 0

  return (
    <article className="card">
      <div className="card-header">
        <h2>{definition.label}</h2>
        <span className="card-figure">{formatMinutes(progress.minutesToday)}</span>
      </div>
      <div className="meter" role="img" aria-label={`${formatMinutes(progress.minutesToday)} of ${targetMinutes} minutes`}>
        <span className="meter-fill" style={{ width: `${fillFraction * 100}%` }} />
      </div>
      <p className="helper">
        {definition.cadenceNote} This week: {progress.daysPracticedThisWeek} of {definition.daysPerWeekMinimum} days
        {progress.metWeeklyDayTarget ? ' - met' : ''}.
      </p>
      {!progress.metTodayMinutesTarget && progress.minutesToday > 0 && (
        <p className="field-hint">About {formatMinutes(progress.minutesShortOfTodayTarget)} more to reach the plan's floor.</p>
      )}
      {definition.goalNote && <p className="field-hint">{definition.goalNote}</p>}
    </article>
  )
}
