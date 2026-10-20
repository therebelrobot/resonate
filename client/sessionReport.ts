import { createPdfWriter } from '../shared/pdf'
import { formatClockDuration, formatFullTimestamp, formatMinutes, formatRating, formatSeconds } from './format'
import { minutesByTrack, sessionTotalMinutes } from '../shared/metrics'
import {
  GLIDE_PACE_LABELS,
  SESSION_ROLE_LABELS,
  TAG_KINDS,
  TAG_KIND_LABELS,
  noteNameForHz,
  recordingDisplayLabel,
  type Recording,
  type Session,
  type SessionSegmentInput,
  type Tag,
  type TagKind,
} from '../shared/model'
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
} from '../shared/protocol'

export interface SessionReportAudioFile {
  recording: Recording
  /** The name this recording carries inside the exported zip. */
  fileName: string
}

export interface SessionReportOptions {
  /** When false, only measurements are printed; every written note is left out. */
  includeWrittenText: boolean
  audioFiles: readonly SessionReportAudioFile[]
}

/** One audio file's zip path, used to tell the reader where to look on disk. */
function describeHz(hz: number): string {
  return `${hz} Hz (${noteNameForHz(hz)})`
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

/** The measured rows for one part, mirroring the session detail screen. */
function segmentMeasurementLines(segment: SessionSegmentInput): string[] {
  const lines: string[] = []
  if (segment.clarityRating !== null) lines.push(`Vibration clarity: ${formatRating(segment.clarityRating)} of 100`)
  if (segment.repetitions !== null) lines.push(`Repetitions: ${segment.repetitions}`)
  if (segment.voiceBreaks !== null) lines.push(`Voice breaks: ${segment.voiceBreaks}`)
  if (segment.glidePace !== null) lines.push(`Pace: ${GLIDE_PACE_LABELS[segment.glidePace]}`)
  if (segment.registerShifts !== null) lines.push(`Register shifts noticed: ${segment.registerShifts}`)
  if (segment.startNote.trim()) lines.push(`Start note: ${segment.startNote}`)
  if (segment.topNote.trim()) lines.push(`Top note: ${segment.topNote}`)
  if (segment.bottomNote.trim()) lines.push(`Bottom note: ${segment.bottomNote}`)
  if (segment.notesClimbed !== null) lines.push(`Notes climbed: ${segment.notesClimbed}`)
  if (segment.longestSustainSeconds !== null) lines.push(`Longest sustain: ${formatSeconds(segment.longestSustainSeconds)}`)
  if (segment.identifiedComfortableRange) lines.push('Comfortable speaking range marked')
  if (segment.phaseNumber !== null) lines.push(`Stretch and Flow phase: ${segment.phaseNumber}`)
  if (segment.coordinationRating !== null) {
    lines.push(`Breathing and phonation coordination: ${formatRating(segment.coordinationRating)} of 100`)
  }

  const stretchAndFlow = segment.stretchAndFlow
  if (stretchAndFlow) {
    const stage = stretchAndFlow.stageId ? STRETCH_AND_FLOW_STAGE_BY_ID.get(stretchAndFlow.stageId) : undefined
    if (stage) lines.push(`Stage: ${stage.label}`)
    if (stretchAndFlow.ratio) {
      lines.push(`Voicing ratio: ${stage?.ratioLabel ?? STRETCH_AND_FLOW_RATIO_LABELS[stretchAndFlow.ratio]}`)
    }
    if (stretchAndFlow.usedTissue !== null) lines.push(`Tissue used: ${stretchAndFlow.usedTissue ? 'Yes' : 'No'}`)
    if (stretchAndFlow.steps.length > 0) {
      const completed = stretchAndFlow.steps.filter((step) => step.completed).length
      lines.push(`Steps completed: ${completed}/${stretchAndFlow.steps.length}`)
    }
    const breathCounts = stretchAndFlow.steps.filter((step) => step.breathCount !== null)
    if (breathCounts.length > 0) {
      lines.push(
        'Breath counts: ' +
          breathCounts
            .map((step) => `${STRETCH_AND_FLOW_STEP_BY_ID.get(step.stepId)?.label ?? step.stepId} ${step.breathCount}`)
            .join(', '),
      )
    }
    if (stretchAndFlow.cuesChecked.length > 0) {
      lines.push(
        'Cues checked: ' +
          stretchAndFlow.cuesChecked.map((cueId) => STRETCH_AND_FLOW_CUE_BY_ID.get(cueId)?.text ?? cueId).join(', '),
      )
    }
    if (stretchAndFlow.toggledAirOnlyAndVoiced !== null) {
      lines.push(`Toggled air-only and voiced: ${stretchAndFlow.toggledAirOnlyAndVoiced ? 'Yes' : 'No'}`)
    }
    if (stretchAndFlow.carryover?.kind) {
      lines.push(`Carryover kind: ${STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[stretchAndFlow.carryover.kind]}`)
    }
    const carryoverItems = (stretchAndFlow.carryover?.itemIds ?? []).map(
      (itemId) => STRETCH_AND_FLOW_CARRYOVER_BY_ID.get(itemId)?.text ?? itemId,
    )
    if (carryoverItems.length > 0) lines.push(`Carryover items: ${carryoverItems.join(', ')}`)
  }

  if (segment.pitch) {
    if (segment.pitch.highHz !== null) lines.push(`High note: ${describeHz(segment.pitch.highHz)}`)
    if (segment.pitch.lowHz !== null) lines.push(`Low note: ${describeHz(segment.pitch.lowHz)}`)
    if (segment.pitch.speakingRangeLowHz !== null) {
      lines.push(`Speaking-range low note: ${describeHz(segment.pitch.speakingRangeLowHz)}`)
    }
  }

  if (segment.resonance) {
    const rungs = segment.resonance.steps
      .filter((step) => step.completed)
      .map((step) => RESONANCE_STEP_BY_ID.get(step.stepId)?.label ?? step.stepId)
    if (rungs.length > 0) lines.push(`Ladder: ${rungs.join(', ')}`)
    if (segment.resonance.comfortablePitchHz !== null) {
      lines.push(`Comfortable pitch: ${describeHz(segment.resonance.comfortablePitchHz)}`)
    }
    const sentences = segment.resonance.sentenceIds.map(
      (sentenceId) => RESONANCE_SENTENCE_BY_ID.get(sentenceId)?.text ?? sentenceId,
    )
    if (sentences.length > 0) lines.push(`Sentences: ${sentences.join(', ')}`)
    if (segment.resonance.intonationRepetitions !== null) {
      lines.push(`Intonation repetitions: ${segment.resonance.intonationRepetitions}`)
    }
  }

  if (segment.carryover) {
    if (segment.carryover.conversationCount !== null) {
      lines.push(`Conversations: ${segment.carryover.conversationCount}`)
    }
    const contexts = segment.carryover.contextIds.map(
      (contextId) => CARRYOVER_CONTEXT_BY_ID.get(contextId)?.text ?? contextId,
    )
    if (contexts.length > 0) lines.push(`Context: ${contexts.join(', ')}`)
    if (segment.carryover.warmedUpBefore !== null) {
      lines.push(`Warmed up before: ${segment.carryover.warmedUpBefore ? 'Yes' : 'No'}`)
    }
  }

  if (segment.paceRating !== null) lines.push(`Endurance pace: ${formatRating(segment.paceRating)} of 100`)
  if (segment.fatigueRating !== null) lines.push(`Endurance fatigue: ${formatRating(segment.fatigueRating)} of 100`)

  return lines
}

/**
 * The free-text fields a step carries beyond its main note: the carryover notes
 * and the carry-over context, both of which used to be dropped from the report.
 */
function segmentFreeText(segment: SessionSegmentInput): { label: string; text: string }[] {
  const entries: { label: string; text: string }[] = []
  const carryoverNotes = segment.stretchAndFlow?.carryover?.customText.trim()
  if (carryoverNotes) entries.push({ label: 'Carryover notes', text: carryoverNotes })
  const customContext = segment.carryover?.customContext.trim()
  if (customContext) entries.push({ label: 'Carry-over context', text: customContext })
  return entries
}

/**
 * Builds the single-session report as PDF bytes. It is the on-screen session
 * detail, laid out for print: what was done, what it measured, what was written,
 * and which audio files came with it.
 */
export function buildSessionReportPdf(
  session: Session,
  tagById: Map<string, Tag>,
  options: SessionReportOptions,
): Uint8Array {
  const writer = createPdfWriter(`Resonate session report - ${formatFullTimestamp(session.occurredAt)}`)
  const trackMinutes = minutesByTrack(session)

  writer.heading('Session report', 1)
  writer.paragraph(formatFullTimestamp(session.occurredAt), { size: 12, spaceAfter: 1 })
  writer.paragraph(
    `${SESSION_ROLE_LABELS[session.role]} - ${formatMinutes(sessionTotalMinutes(session))} total` +
      (session.status === 'draft' ? ' - draft' : ''),
    { size: 10.5 },
  )
  writer.rule()

  writer.heading('Effort', 2)
  writer.bullets(
    session.effortAfter === null
      ? [`Before: ${formatRating(session.effortBefore)} of 100`]
      : [`Before: ${formatRating(session.effortBefore)} of 100`, `After: ${formatRating(session.effortAfter)} of 100`],
  )

  writer.heading('Time by track', 2)
  const trackLines = PRACTICE_TRACKS.filter((track) => trackMinutes[track] > 0).map(
    (track) => `${TRACK_DEFINITIONS[track].label}: ${formatMinutes(trackMinutes[track])}`,
  )
  if (trackLines.length > 0) writer.bullets(trackLines)
  else writer.paragraph('No timed parts recorded.', { indent: 12 })

  for (const segment of session.segments) {
    writer.heading(`${SEGMENT_DEFINITIONS[segment.kind].label} - ${formatMinutes(segment.seconds / 60)}`, 2)
    const measurementLines = segmentMeasurementLines(segment)
    if (measurementLines.length > 0) writer.bullets(measurementLines)
    const segmentTagNames = segment.tagIds.map((tagId) => tagById.get(tagId)?.name ?? 'Unknown tag')
    if (segmentTagNames.length > 0) writer.labelled('Tags', segmentTagNames.join(', '))

    if (options.includeWrittenText) {
      if (segment.notes.trim()) writer.labelled('Notes', segment.notes.trim())
      for (const entry of segmentFreeText(segment)) writer.labelled(entry.label, entry.text)
    }
  }

  const tagSections = TAG_KINDS.map((tagKind) => ({ tagKind, names: tagNamesOfKind(session, tagKind, tagById) })).filter(
    (section) => section.names.length > 0,
  )
  if (tagSections.length > 0) {
    writer.heading('Tags', 2)
    for (const section of tagSections) {
      writer.labelled(TAG_KIND_LABELS[section.tagKind].plural, section.names.join(', '))
    }
  }

  if (options.includeWrittenText && session.slpNote.trim()) {
    writer.heading('Notes for your SLP', 2)
    writer.paragraph(session.slpNote.trim(), { indent: 12 })
  }

  if (options.audioFiles.length > 0) {
    writer.heading('Recordings', 2)
    writer.paragraph(
      'The audio is in the audio folder of this export, named to match the list below.',
      { size: 10, indent: 12, spaceAfter: 3 },
    )
    writer.bullets(
      options.audioFiles.map(({ recording, fileName }) => {
        const stepLabel = recording.segmentKind ? SEGMENT_DEFINITIONS[recording.segmentKind].label : 'Session'
        return `${fileName} - ${stepLabel}, ${formatClockDuration(recording.durationSeconds)} (${recordingDisplayLabel(recording)})`
      }),
    )
  }

  writer.rule()
  writer.paragraph(
    `Prepared in the browser from the encrypted practice log. Measurements only where not marked as written. ` +
      `Exported ${new Date().toLocaleString()}.`,
    { size: 8.5 },
  )

  return writer.finish()
}
