import { useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { navigateTo } from '../router'
import { exportSessionPackage } from '../sessionPackage'
import { formatClockDuration, formatFullTimestamp, formatMinutes, formatRating, formatSeconds } from '../format'
import { minutesByTrack, sessionTotalMinutes } from '../../shared/metrics'
import {
  GLIDE_PACE_LABELS,
  SESSION_ROLE_LABELS,
  TAG_KINDS,
  TAG_KIND_LABELS,
  noteNameForHz,
  recordingDisplayLabel,
  type CarryoverDetail,
  type PitchWorkInput,
  type Recording,
  type ResonanceDetail,
  type Session,
  type StretchAndFlowDetail,
  type TagKind,
} from '../../shared/model'
import {
  CARRYOVER_CONTEXT_BY_ID,
  PRACTICE_TRACKS,
  RESONANCE_SENTENCE_BY_ID,
  RESONANCE_STEP_BY_ID,
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
  const { tagById, refresh, recordingsBySessionId } = useSessionData()
  const sessionRecordings = recordingsBySessionId.get(session.id) ?? []
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeWrittenText, setIncludeWrittenText] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const trackMinutes = minutesByTrack(session)

  const exportPackage = async () => {
    setIsExporting(true)
    setExportError(null)
    setExportNotice(null)
    setExportProgress(sessionRecordings.length > 0 ? `Preparing 1 of ${sessionRecordings.length}...` : 'Building the report...')
    try {
      const result = await exportSessionPackage({
        session,
        tagById,
        recordings: sessionRecordings,
        includeWrittenText,
        onProgress: ({ completed, total, label }) => {
          if (total === 0 || completed >= total) {
            setExportProgress('Building the report...')
          } else {
            setExportProgress(`Converting ${completed + 1} of ${total} (${label})...`)
          }
        },
      })
      const keptOriginal = result.undecodedCount
      setExportNotice(
        `Downloaded ${result.fileName}` +
          (keptOriginal > 0
            ? `. ${keptOriginal} recording${keptOriginal === 1 ? '' : 's'} kept in ${keptOriginal === 1 ? 'its' : 'their'} original format because this browser could not convert ${keptOriginal === 1 ? 'it' : 'them'}.`
            : '.'),
      )
    } catch (exportFailure) {
      setExportError(exportFailure instanceof Error ? exportFailure.message : 'Could not build the export.')
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }

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
            {segment.pitch && <PitchDetailRows pitch={segment.pitch} />}
            {segment.resonance && <ResonanceDetailRows detail={segment.resonance} />}
            {segment.carryover && <CarryoverDetailRows detail={segment.carryover} />}
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
          <SegmentRecordings recordings={sessionRecordings.filter((recording) => recording.segmentKind === segment.kind)} />
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

      <section className="detail-section">
        <h2>Export</h2>
        <p className="field-hint">
          One zip file: this session as a report for your SLP (PDF), plus every recording as a playable WAV named for
          this session, its step, and the time it was recorded. The files are plaintext once downloaded, so send them
          deliberately.
        </p>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={includeWrittenText}
            disabled={isExporting}
            onChange={(event) => setIncludeWrittenText(event.target.checked)}
          />
          <span>Include what I wrote (step notes and the SLP note)</span>
        </label>
        <button type="button" className="button button-primary" onClick={() => void exportPackage()} disabled={isExporting}>
          {isExporting
            ? 'Exporting...'
            : sessionRecordings.length > 0
              ? `Download report and ${sessionRecordings.length} recording${sessionRecordings.length === 1 ? '' : 's'} (.zip)`
              : 'Download report (.zip)'}
        </button>
        {exportProgress && <p className="field-hint" role="status">{exportProgress}</p>}
        {exportNotice && <p className="form-ok">{exportNotice}</p>}
        {exportError && <p className="form-error">{exportError}</p>}
      </section>

      {error && <p className="form-error">{error}</p>}

      <footer className="detail-footer">
        <button type="button" className="button button-danger" onClick={() => void deleteSession()} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete this session'}
        </button>
      </footer>
    </div>
  )
}

/** Inline recordings attached to a step, playable from the encrypted store. */
function SegmentRecordings({ recordings }: { recordings: Recording[] }) {
  if (recordings.length === 0) return null
  return (
    <div className="recording-list">
      {recordings.map((recording) => (
        <div key={recording.id} className="recording-item">
          <div className="recording-item-head">
            <span className="recording-item-label">{recordingDisplayLabel(recording)}</span>
            <span className="recording-item-meta">{formatClockDuration(recording.durationSeconds)}</span>
          </div>
          <audio controls preload="none" src={api.recordingAudioUrl(recording.id)} />
        </div>
      ))}
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

function describeHz(hz: number): string {
  return `${hz} Hz (${noteNameForHz(hz)})`
}

/** The VFE pitch readings, resolved to note names (spec 7.4). */
function PitchDetailRows({ pitch }: { pitch: PitchWorkInput }) {
  return (
    <>
      {pitch.highHz !== null && <li>High note: {describeHz(pitch.highHz)}</li>}
      {pitch.lowHz !== null && <li>Low note: {describeHz(pitch.lowHz)}</li>}
      {pitch.speakingRangeLowHz !== null && <li>Speaking-range low note: {describeHz(pitch.speakingRangeLowHz)}</li>}
    </>
  )
}

/** The structured Resonance detail, resolved to catalog text (spec 7.4). */
function ResonanceDetailRows({ detail }: { detail: ResonanceDetail }) {
  const rungLabels = detail.steps
    .filter((step) => step.completed)
    .map((step) => RESONANCE_STEP_BY_ID.get(step.stepId)?.label ?? step.stepId)
  const sentenceTexts = detail.sentenceIds.map(
    (sentenceId) => RESONANCE_SENTENCE_BY_ID.get(sentenceId)?.text ?? sentenceId,
  )
  return (
    <>
      {rungLabels.length > 0 && <li>Ladder: {rungLabels.join(', ')}</li>}
      {detail.comfortablePitchHz !== null && <li>Comfortable pitch: {describeHz(detail.comfortablePitchHz)}</li>}
      {sentenceTexts.length > 0 && <li>Sentences: {sentenceTexts.join(', ')}</li>}
      {detail.intonationRepetitions !== null && <li>Intonation repetitions: {detail.intonationRepetitions}</li>}
    </>
  )
}

/** The structured Carry-Over detail, resolved to catalog text (spec 7.4). */
function CarryoverDetailRows({ detail }: { detail: CarryoverDetail }) {
  const contextTexts = detail.contextIds.map((contextId) => CARRYOVER_CONTEXT_BY_ID.get(contextId)?.text ?? contextId)
  return (
    <>
      {detail.conversationCount !== null && <li>Conversations: {detail.conversationCount}</li>}
      {contextTexts.length > 0 && <li>Context: {contextTexts.join(', ')}</li>}
      {detail.customContext.trim() && <li>Other context: {detail.customContext}</li>}
      {detail.warmedUpBefore !== null && <li>Warmed up before: {detail.warmedUpBefore ? 'Yes' : 'No'}</li>}
    </>
  )
}
