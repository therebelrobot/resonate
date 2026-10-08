import { useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { navigateTo } from '../router'
import { formatFullTimestamp, formatMinutes, formatRating, formatSeconds } from '../format'
import { minutesByTrack, sessionTotalMinutes } from '../../shared/metrics'
import {
  GLIDE_PACE_LABELS,
  SESSION_ROLE_LABELS,
  TAG_KINDS,
  TAG_KIND_LABELS,
  type Session,
  type StretchAndFlowDetail,
  type TagKind,
} from '../../shared/model'
import {
  PRACTICE_TRACKS,
  SEGMENT_DEFINITIONS,
  STRETCH_AND_FLOW_CARRYOVER_BY_ID,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUE_BY_ID,
  STRETCH_AND_FLOW_RATIO_LABELS,
  STRETCH_AND_FLOW_STAGE_BY_ID,
  STRETCH_AND_FLOW_STEP_BY_ID,
  TRACK_DEFINITIONS,
} from '../../shared/protocol'

export function SessionDetailScreen({ session }: { session: Session }) {
  const { tagById, refresh } = useSessionData()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trackMinutes = minutesByTrack(session)

  const deleteSession = async () => {
    if (!window.confirm('Delete this session? This cannot be undone.')) return
    setIsDeleting(true)
    try {
      await api.deleteSession(session.id)
      await refresh()
      navigateTo('/sessions', { replace: true })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete.')
      setIsDeleting(false)
    }
  }

  const tagNamesOfKind = (tagKind: TagKind) => {
    const tagIds =
      tagKind === 'focus'
        ? session.focusTagIds
        : tagKind === 'win'
          ? session.winTagIds
          : tagKind === 'watch'
            ? session.watchTagIds
            : session.segments.flatMap((segment) => segment.tagIds).filter((tagId) => tagById.get(tagId)?.kind === tagKind)
    return tagIds.map((tagId) => tagById.get(tagId)?.name ?? 'Unknown tag')
  }

  return (
    <div className="screen detail">
      <header className="detail-header">
        <a className="button button-quiet back-link" href="#/sessions">
          History
        </a>
        <a className="button button-secondary button-small" href={`#/sessions/${session.id}/edit`}>
          Edit
        </a>
      </header>

      <div>
        <p className="detail-when">{formatFullTimestamp(session.occurredAt)}</p>
        <p className="screen-subtitle">
          {SESSION_ROLE_LABELS[session.role]} - {formatMinutes(sessionTotalMinutes(session))} total
          {session.status === 'draft' ? ' - draft' : ''}
        </p>
      </div>

      <section className="detail-section">
        <h2>Effort</h2>
        <p className="detail-text">
          Before {formatRating(session.effortBefore)}
          {session.effortAfter === null ? '' : `, after ${formatRating(session.effortAfter)}`}
        </p>
      </section>

      <section className="detail-section">
        <h2>Time by track</h2>
        <ul className="detail-tags">
          {PRACTICE_TRACKS.filter((track) => trackMinutes[track] > 0).map((track) => (
            <li key={track} className="mini-chip">
              {TRACK_DEFINITIONS[track].label}: {formatMinutes(trackMinutes[track])}
            </li>
          ))}
        </ul>
      </section>

      {session.segments.map((segment) => (
        <section key={segment.kind} className="detail-section">
          <h2>
            {SEGMENT_DEFINITIONS[segment.kind].label} - {formatMinutes(segment.seconds / 60)}
          </h2>
          <ul className="measure-list">
            {segment.clarityRating !== null && <li>Vibration clarity: {formatRating(segment.clarityRating)}</li>}
            {segment.repetitions !== null && <li>Repetitions: {segment.repetitions}</li>}
            {segment.voiceBreaks !== null && <li>Voice breaks: {segment.voiceBreaks}</li>}
            {segment.glidePace !== null && <li>Pace: {GLIDE_PACE_LABELS[segment.glidePace]}</li>}
            {segment.registerShifts !== null && <li>Register shifts noticed: {segment.registerShifts}</li>}
            {segment.startNote && <li>Start note: {segment.startNote}</li>}
            {segment.topNote && <li>Top note: {segment.topNote}</li>}
            {segment.bottomNote && <li>Bottom note: {segment.bottomNote}</li>}
            {segment.notesClimbed !== null && <li>Notes climbed: {segment.notesClimbed}</li>}
            {segment.longestSustainSeconds !== null && <li>Longest sustain: {formatSeconds(segment.longestSustainSeconds)}</li>}
            {segment.identifiedComfortableRange && <li>Comfortable speaking range marked</li>}
            {segment.phaseNumber !== null && <li>Stretch and Flow phase: {segment.phaseNumber}</li>}
            {segment.coordinationRating !== null && <li>Breathing and phonation: {formatRating(segment.coordinationRating)}</li>}
            {segment.stretchAndFlow && <StretchAndFlowDetailRows detail={segment.stretchAndFlow} />}
            {segment.paceRating !== null && <li>Pace: {formatRating(segment.paceRating)}</li>}
            {segment.fatigueRating !== null && <li>Fatigue: {formatRating(segment.fatigueRating)}</li>}
          </ul>
          {segment.tagIds.length > 0 && (
            <ul className="detail-tags">
              {segment.tagIds.map((tagId) => (
                <li key={tagId} className="mini-chip">
                  {tagById.get(tagId)?.name ?? 'Unknown tag'}
                </li>
              ))}
            </ul>
          )}
          {segment.notes.trim() && <p className="detail-text">{segment.notes}</p>}
        </section>
      ))}

      <section className="detail-section">
        <h2>Tags</h2>
        {TAG_KINDS.map((tagKind) => {
          const names = tagNamesOfKind(tagKind)
          if (names.length === 0) return null
          return (
            <div key={tagKind}>
              <p className="field-label">{TAG_KIND_LABELS[tagKind].plural}</p>
              <ul className="detail-tags">
                {names.map((name) => (
                  <li key={name} className="mini-chip">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      {session.slpNote.trim() && (
        <section className="detail-section">
          <h2>Notes for your SLP</h2>
          <p className="detail-text">{session.slpNote}</p>
        </section>
      )}

      {error && <p className="form-error">{error}</p>}

      <footer className="detail-footer">
        <button type="button" className="button button-danger" onClick={() => void deleteSession()} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete this session'}
        </button>
      </footer>
    </div>
  )
}

/** The structured Stretch and Flow detail, resolved to catalog text (spec 7.4). */
function StretchAndFlowDetailRows({ detail }: { detail: StretchAndFlowDetail }) {
  const stage = detail.stageId ? STRETCH_AND_FLOW_STAGE_BY_ID.get(detail.stageId) : undefined
  const completedSteps = detail.steps.filter((step) => step.completed)
  const breathCounts = detail.steps.filter((step) => step.breathCount !== null)
  const cueTexts = detail.cuesChecked.map((cueId) => STRETCH_AND_FLOW_CUE_BY_ID.get(cueId)?.text ?? cueId)
  const carryoverItems = (detail.carryover?.itemIds ?? []).map(
    (itemId) => STRETCH_AND_FLOW_CARRYOVER_BY_ID.get(itemId)?.text ?? itemId,
  )
  return (
    <>
      {stage && <li>Stage: {stage.label}</li>}
      {detail.ratio && <li>Voicing ratio: {stage?.ratioLabel ?? STRETCH_AND_FLOW_RATIO_LABELS[detail.ratio]}</li>}
      {detail.usedTissue !== null && <li>Tissue used: {detail.usedTissue ? 'Yes' : 'No'}</li>}
      {detail.steps.length > 0 && (
        <li>
          Steps completed: {completedSteps.length}/{detail.steps.length}
        </li>
      )}
      {breathCounts.length > 0 && (
        <li>
          Breath counts:{' '}
          {breathCounts
            .map((step) => `${STRETCH_AND_FLOW_STEP_BY_ID.get(step.stepId)?.label ?? step.stepId} ${step.breathCount}`)
            .join(', ')}
        </li>
      )}
      {cueTexts.length > 0 && <li>Cues checked: {cueTexts.join(', ')}</li>}
      {detail.toggledAirOnlyAndVoiced !== null && (
        <li>Toggled air-only and voiced: {detail.toggledAirOnlyAndVoiced ? 'Yes' : 'No'}</li>
      )}
      {detail.carryover?.kind && <li>Carryover kind: {STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[detail.carryover.kind]}</li>}
      {carryoverItems.length > 0 && <li>Carryover items: {carryoverItems.join(', ')}</li>}
      {detail.carryover?.customText.trim() && <li>Carryover notes: {detail.carryover.customText}</li>}
    </>
  )
}
