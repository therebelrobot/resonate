import { useMemo, useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { formatMinutes, formatPercent, formatRating, formatSigned } from '../format'
import {
  currentStretchAndFlowStage,
  currentStretchAndFlowStageLabel,
  effortShiftSummary,
  glideShareSummary,
  practiceStreakDays,
  protocolHighlights,
  sessionTotalMinutes,
  sessionsInRange,
  STRETCH_AND_FLOW_CARRYOVER_CATALOG_SIZE,
  topTagsOfKind,
  trackProgress,
} from '../../shared/metrics'
import { buildCsvText } from '../../shared/csv'
import {
  PRACTICE_TRACKS,
  SEGMENT_DEFINITIONS,
  STRETCH_AND_FLOW_CARRYOVER_BY_ID,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUE_BY_ID,
  STRETCH_AND_FLOW_RATIO_LABELS,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  TRACK_DEFINITIONS,
  SEGMENT_TRACK,
} from '../../shared/protocol'
import { SESSION_ROLE_LABELS, TAG_KIND_LABELS, type Session, type Tag, type TagKind } from '../../shared/model'

const RANGE_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: null, label: 'Everything' },
] as const

const CSV_COLUMNS = ['Date', 'Time', 'Timestamp', 'Measure', 'Value', 'Unit', 'Notes']

export function ReportScreen() {
  const { sessions, tags, tagById, isLoading, loadError } = useSessionData()
  const [rangeDays, setRangeDays] = useState<number | null>(30)
  const [includeWrittenText, setIncludeWrittenText] = useState(true)
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set())
  const [printNotice, setPrintNotice] = useState<string | null>(null)

  const tagByIdEntity = useMemo(() => new Map(tags.map((tag) => [tag.id, tag as Tag])), [tags])

  const reportSessions = useMemo(() => {
    const now = new Date()
    const fromIso =
      rangeDays === null ? '0000-01-01T00:00:00.000Z' : new Date(now.getTime() - rangeDays * 86_400_000).toISOString()
    const inRange = sessionsInRange(sessions, fromIso, now.toISOString())
    return inRange
      .filter((session) => (includeDrafts ? true : session.status === 'complete'))
      .filter((session) => !excludedIds.has(session.id))
  }, [sessions, rangeDays, includeDrafts, excludedIds])

  const allInRange = useMemo(() => {
    const now = new Date()
    const fromIso =
      rangeDays === null ? '0000-01-01T00:00:00.000Z' : new Date(now.getTime() - rangeDays * 86_400_000).toISOString()
    return sessionsInRange(sessions, fromIso, now.toISOString()).filter((session) =>
      includeDrafts ? true : session.status === 'complete',
    )
  }, [sessions, rangeDays, includeDrafts])

  if (isLoading) return <p className="screen-message">Opening your practice log...</p>
  if (loadError) return <p className="screen-message form-error">{loadError}</p>

  const now = new Date()
  const progressByTrack = trackProgress(reportSessions, now)
  const highlights = protocolHighlights(reportSessions)
  const effortShift = effortShiftSummary(reportSessions)
  const glideShare = glideShareSummary(reportSessions)
  const streakDays = practiceStreakDays(sessions, now)
  const topWatchItems = topTagsOfKind(reportSessions, 'watch', tagByIdEntity, 6)
  const topTargets = topTagsOfKind(reportSessions, 'focus', tagByIdEntity, 6)
  const currentStage = currentStretchAndFlowStage(reportSessions)
  const currentStageLabel = currentStretchAndFlowStageLabel(reportSessions)

  const printReport = () => {
    window.print()
    setPrintNotice('The report was printed or saved as a PDF. Printing is recorded in the access log.')
    void api.recordClientExport('report').catch(() => undefined)
  }

  const downloadCsv = () => {
    const csvText = buildCsvText(CSV_COLUMNS, buildSlpCsvRows(reportSessions, tagByIdEntity, includeWrittenText))
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `resonate-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    void api.recordClientExport('session_csv').catch(() => undefined)
  }

  return (
    <div className="screen report">
      <header className="screen-header no-print">
        <h1>Report for your SLP</h1>
        <p className="screen-subtitle">
          Built in this browser from the sessions you already have open. Nothing is sent anywhere; the server only records
          that a report was made. The printed page and the CSV are plaintext, so send them deliberately.
        </p>
      </header>

      <section className="detail-section no-print">
        <h2>Range</h2>
        <div className="chip-row">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className="chip"
              aria-pressed={rangeDays === option.days}
              onClick={() => setRangeDays(option.days)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="checkbox-field">
          <input type="checkbox" checked={includeWrittenText} onChange={(event) => setIncludeWrittenText(event.target.checked)} />
          <span>Include what I wrote (notes and the SLP note)</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} />
          <span>Include drafts</span>
        </label>
      </section>

      {allInRange.length > 0 && (
        <section className="detail-section no-print">
          <h2>Sessions to include</h2>
          <p className="field-hint">
            {reportSessions.length} of {allInRange.length} selected.
          </p>
          <div className="chip-row">
            <button type="button" className="chip" onClick={() => setExcludedIds(new Set())}>
              Select all
            </button>
            <button type="button" className="chip" onClick={() => setExcludedIds(new Set(allInRange.map((session) => session.id)))}>
              Select none
            </button>
          </div>
          <ul className="selection-list">
            {allInRange.map((session) => (
              <li key={session.id}>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={!excludedIds.has(session.id)}
                    onChange={(event) => {
                      const next = new Set(excludedIds)
                      if (event.target.checked) next.delete(session.id)
                      else next.add(session.id)
                      setExcludedIds(next)
                    }}
                  />
                  <span>
                    {new Date(session.occurredAt).toLocaleDateString()} - {formatMinutes(sessionTotalMinutes(session))} -{' '}
                    {SESSION_ROLE_LABELS[session.role]}
                    {session.status === 'draft' ? ' (draft)' : ''}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h2>Summary</h2>
        {reportSessions.length === 0 ? (
          <p className="empty-hint">No sessions in this range. Widen the range or include drafts.</p>
        ) : (
          <>
            <p className="detail-text">
              {reportSessions.length} {reportSessions.length === 1 ? 'session' : 'sessions'},{' '}
              {formatMinutes(highlights.totalMinutes)} of practice, current streak {streakDays}{' '}
              {streakDays === 1 ? 'day' : 'days'}.
            </p>
            <table className="rating-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Days in range</th>
                  <th>Minutes</th>
                  <th>Plan floor</th>
                </tr>
              </thead>
              <tbody>
                {PRACTICE_TRACKS.map((track) => (
                  <tr key={track}>
                    <th>{TRACK_DEFINITIONS[track].label}</th>
                    <td>{progressByTrack[track].daysPracticedLastFourWeeks}</td>
                    <td>{formatMinutes(progressByTrack[track].minutesLastFourWeeks)}</td>
                    <td>{formatMinutes(TRACK_DEFINITIONS[track].sessionMinutesMinimum)} per session</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="detail-text">
              Effort: {formatRating(effortShift.averageBefore)} before, {formatRating(effortShift.averageAfter)} after (
              {formatSigned(effortShift.averageChange, 1)} change across {effortShift.reRatedSessionCount} re-rated
              sessions).
            </p>
            <p className="detail-text">
              Glides: {formatPercent(glideShare.glideShare)} of vocal function time, {formatPercent(glideShare.slowPaceShare)} of
              that at a slow pace, longest part in {formatPercent(glideShare.glideWasLongestShare)} of sessions.
            </p>
            <p className="detail-text">
              Warm-up: average clarity {formatRating(highlights.averageWarmupClarity)} of 100,{' '}
              {formatRating(highlights.averageVoiceBreaksPerWarmup)} voice breaks per warm-up.
            </p>
            <p className="detail-text">
              POWER: longest sustain {highlights.longestSustainSeconds === null ? 'not recorded' : `${highlights.longestSustainSeconds} seconds`},
              most notes climbed {highlights.mostNotesClimbed ?? 'not recorded'}, comfortable range marked{' '}
              {highlights.comfortableRangeMarkedCount} times.
            </p>
            <p className="detail-text">
              Stretch and Flow: currently {currentStageLabel}, average coordination{' '}
              {formatRating(highlights.averageCoordination)} of 100, {formatMinutes(highlights.stretchAndFlowMinutes)} across{' '}
              {highlights.stretchAndFlowSessionCount} {highlights.stretchAndFlowSessionCount === 1 ? 'session' : 'sessions'}.
              Average breath count{' '}
              {highlights.averageStretchAndFlowBreathCount === null
                ? 'not recorded'
                : Math.round(highlights.averageStretchAndFlowBreathCount)}
              , cue adherence {formatPercent(highlights.stretchAndFlowCueAdherence)}, carryover{' '}
              {highlights.stretchAndFlowCarryoverItemCount} of {STRETCH_AND_FLOW_CARRYOVER_CATALOG_SIZE} catalog items.
            </p>
            <p className="detail-text">
              Endurance: {formatMinutes(highlights.enduranceMinutes)} total, longest single stretch{' '}
              {highlights.longestEnduranceMinutes === null ? 'not recorded' : formatMinutes(highlights.longestEnduranceMinutes)}.
            </p>
            {topTargets.length > 0 && (
              <p className="detail-text">
                Most common targets: {topTargets.map((tally) => `${tally.name} (${tally.count})`).join(', ')}.
              </p>
            )}
            {topWatchItems.length > 0 && (
              <p className="detail-text">
                Most common watch items: {topWatchItems.map((tally) => `${tally.name} (${tally.count})`).join(', ')}.
              </p>
            )}
          </>
        )}
      </section>

      {reportSessions.map((session) => (
        <section key={session.id} className="detail-section report-session">
          <h2>
            {new Date(session.occurredAt).toLocaleString()} - {SESSION_ROLE_LABELS[session.role]} -{' '}
            {formatMinutes(sessionTotalMinutes(session))}
          </h2>
          <p className="detail-text">
            Vocal effort {formatRating(session.effortBefore)}
            {session.effortAfter === null ? '' : ` to ${formatRating(session.effortAfter)}`}
          </p>
          <ul className="measure-list">
            {session.segments.map((segment) => (
              <li key={segment.kind}>
                {SEGMENT_DEFINITIONS[segment.kind].label}: {formatMinutes(segment.seconds / 60)}
                {segment.glidePace === null ? '' : `, ${segment.glidePace}`}
                {segment.clarityRating === null ? '' : `, clarity ${segment.clarityRating}`}
                {segment.voiceBreaks === null ? '' : `, ${segment.voiceBreaks} voice breaks`}
                {segment.registerShifts === null ? '' : `, ${segment.registerShifts} register shifts`}
                {segment.notesClimbed === null ? '' : `, ${segment.notesClimbed} notes climbed`}
                {segment.longestSustainSeconds === null ? '' : `, longest sustain ${segment.longestSustainSeconds}s`}
                {segment.phaseNumber === null ? '' : `, phase ${segment.phaseNumber}`}
                {segment.coordinationRating === null ? '' : `, coordination ${segment.coordinationRating}`}
                {segment.stretchAndFlow?.stageId
                  ? `, stage ${STRETCH_AND_FLOW_STAGE_BY_ID.get(segment.stretchAndFlow.stageId)?.label ?? segment.stretchAndFlow.stageId}`
                  : ''}
                {segment.stretchAndFlow?.ratio
                  ? `, ratio ${STRETCH_AND_FLOW_RATIO_LABELS[segment.stretchAndFlow.ratio]}`
                  : ''}
                {segment.stretchAndFlow?.usedTissue === true ? ', tissue used' : ''}
                {segment.stretchAndFlow && segment.stretchAndFlow.steps.length > 0
                  ? `, steps ${segment.stretchAndFlow.steps.filter((step) => step.completed).length}/${segment.stretchAndFlow.steps.length}`
                  : ''}
                {segment.stretchAndFlow && segment.stretchAndFlow.cuesChecked.length > 0
                  ? `, cues ${segment.stretchAndFlow.cuesChecked.length}`
                  : ''}
                {segment.fatigueRating === null ? '' : `, fatigue ${segment.fatigueRating}`}
              </li>
            ))}
          </ul>
          {tagNamesOfKind(session, 'watch', tagByIdEntity).length > 0 && (
            <p className="detail-text">Watch items: {tagNamesOfKind(session, 'watch', tagByIdEntity).join(', ')}.</p>
          )}
          {includeWrittenText && session.slpNote.trim() && <p className="detail-text">{session.slpNote}</p>}
        </section>
      ))}

      <section className="detail-section no-print">
        <div className="finish-actions">
          <button type="button" className="button button-secondary" onClick={downloadCsv} disabled={reportSessions.length === 0}>
            Download CSV
          </button>
          <button type="button" className="button button-primary" onClick={printReport} disabled={reportSessions.length === 0}>
            Print or save as PDF
          </button>
        </div>
        {printNotice && <p className="form-ok">{printNotice}</p>}
        <p className="field-hint">
          The CSV is one row per measurement (Date, Time, Timestamp, Measure, Value, Unit, Notes) so it can be mapped into
          most clinical tools without unstacking. Column mapping may still need adjusting once you see their import screen.
        </p>
      </section>
    </div>
  )
}

function tagNamesOfKind(session: Session, tagKind: TagKind, tagById: Map<string, Tag>): string[] {
  const tagIds =
    tagKind === 'focus'
      ? session.focusTagIds
      : tagKind === 'win'
        ? session.winTagIds
        : tagKind === 'watch'
          ? session.watchTagIds
          : session.segments.flatMap((segment) => segment.tagIds)
  return tagIds
    .map((tagId) => tagById.get(tagId))
    .filter((tag): tag is Tag => tag !== undefined && tag.kind === tagKind)
    .map((tag) => tag.name)
}

/** Long format: one row per measurement, the shape clinical tools tend to expect. */
function buildSlpCsvRows(sessions: readonly Session[], tagById: Map<string, Tag>, includeWrittenText: boolean): string[][] {
  const rows: string[][] = []
  for (const session of sessions) {
    const occurredAt = new Date(session.occurredAt)
    const dateText = occurredAt.toLocaleDateString()
    const timeText = occurredAt.toLocaleTimeString()
    const prefix = [dateText, timeText, session.occurredAt]
    const addRow = (measure: string, value: string, unit: string, notes: string) => {
      rows.push([...prefix, measure, value, unit, notes])
    }

    for (const track of PRACTICE_TRACKS) {
      const minutes = session.segments
        .filter((segment) => SEGMENT_TRACK[segment.kind] === track)
        .reduce((total, segment) => total + segment.seconds, 0) / 60
      if (minutes > 0) addRow(`${TRACK_DEFINITIONS[track].label} minutes`, minutes.toFixed(1), 'minutes', '')
    }
    addRow('Vocal effort before', String(session.effortBefore), '0-100', '')
    if (session.effortAfter !== null) addRow('Vocal effort after', String(session.effortAfter), '0-100', '')

    for (const segment of session.segments) {
      addRow(`${SEGMENT_DEFINITIONS[segment.kind].label} minutes`, (segment.seconds / 60).toFixed(1), 'minutes', '')
      if (segment.clarityRating !== null) addRow('Warm-up vibration clarity', String(segment.clarityRating), '0-100', '')
      if (segment.voiceBreaks !== null) addRow('Warm-up voice breaks', String(segment.voiceBreaks), 'count', '')
      if (segment.repetitions !== null) addRow('Warm-up repetitions', String(segment.repetitions), 'count', '')
      if (segment.registerShifts !== null) addRow('Glide register shifts', String(segment.registerShifts), 'count', '')
      if (segment.glidePace !== null) addRow('Glide pace', segment.glidePace, 'category', '')
      if (segment.notesClimbed !== null) addRow('POWER notes climbed', String(segment.notesClimbed), 'count', '')
      if (segment.longestSustainSeconds !== null) addRow('POWER longest sustain', String(segment.longestSustainSeconds), 'seconds', '')
      if (segment.identifiedComfortableRange) addRow('Comfortable speaking range marked', '1', 'yes/no', '')
      if (segment.phaseNumber !== null) addRow('Stretch and Flow phase', String(segment.phaseNumber), 'phase', '')
      if (segment.coordinationRating !== null) addRow('Breathing and phonation coordination', String(segment.coordinationRating), '0-100', '')
      if (segment.stretchAndFlow) {
        const detail = segment.stretchAndFlow
        const stage = detail.stageId ? STRETCH_AND_FLOW_STAGE_BY_ID.get(detail.stageId) : undefined
        if (stage) addRow('Stretch and Flow stage', stage.label, 'category', '')
        if (detail.ratio) addRow('Voicing ratio', STRETCH_AND_FLOW_RATIO_LABELS[detail.ratio], 'category', '')
        if (detail.usedTissue !== null) addRow('Tissue used', detail.usedTissue ? '1' : '0', 'yes/no', '')
        if (detail.steps.length > 0) {
          const completedSteps = detail.steps.filter((step) => step.completed).length
          addRow('Steps completed', `${completedSteps}/${detail.steps.length}`, 'count', '')
        }
        const breathCounts = detail.steps
          .map((step) => step.breathCount)
          .filter((breathCount): breathCount is number => breathCount !== null)
        if (breathCounts.length > 0) addRow('Max breath count', String(Math.max(...breathCounts)), 'count', '')
        if (detail.cuesChecked.length > 0) {
          addRow(
            'Cues checked',
            detail.cuesChecked.map((cueId) => STRETCH_AND_FLOW_CUE_BY_ID.get(cueId)?.text ?? cueId).join('; '),
            'category',
            '',
          )
        }
        if (detail.carryover?.kind) {
          addRow('Carryover kind', STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[detail.carryover.kind], 'category', '')
        }
        const carryoverItems = (detail.carryover?.itemIds ?? []).map(
          (itemId) => STRETCH_AND_FLOW_CARRYOVER_BY_ID.get(itemId)?.text ?? itemId,
        )
        if (carryoverItems.length > 0) addRow('Carryover items', carryoverItems.join('; '), 'category', '')
      }
      if (segment.paceRating !== null) addRow('Endurance pace', String(segment.paceRating), '0-100', '')
      if (segment.fatigueRating !== null) addRow('Endurance fatigue', String(segment.fatigueRating), '0-100', '')
    }

    for (const tagKind of ['focus', 'win', 'watch'] as TagKind[]) {
      const names = tagNamesOfKind(session, tagKind, tagById)
      if (names.length > 0) addRow(TAG_KIND_LABELS[tagKind].plural, names.join('; '), 'tag', '')
    }

    // One row per session so the session-level totals survive the long format.
    const summaryNote = includeWrittenText ? session.slpNote.replace(/\s+/g, ' ').slice(0, 400) : ''
    addRow('Session', sessionTotalMinutes(session).toFixed(1), 'minutes', summaryNote)
  }
  return rows
}
