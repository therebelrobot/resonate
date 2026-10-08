import { buildCsvText } from '../shared/csv'
import { minutesByTrack } from '../shared/metrics'
import { GLIDE_PACE_LABELS, SESSION_ROLE_LABELS } from '../shared/model'
import type { Session, SessionSegmentInput, Tag, TagKind } from '../shared/model'
import {
  SEGMENT_DEFINITIONS,
  STRETCH_AND_FLOW_CARRYOVER_BY_ID,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUE_BY_ID,
  STRETCH_AND_FLOW_RATIO_LABELS,
  STRETCH_AND_FLOW_STAGE_BY_ID,
} from '../shared/protocol'

/**
 * One row per part of each session, so a spreadsheet can filter by part, phase, or
 * date without unstacking anything. Sessions with no parts recorded still get one
 * row, with the part columns blank.
 *
 * Date and Time are formatted in RESONATE_TIMEZONE (see server/config.ts) because
 * the stored timestamps are UTC; the browser-built export uses the device's zone
 * instead. The raw Timestamp column is always present if you would rather format
 * it yourself.
 */
const CSV_COLUMNS: readonly string[] = [
  'Session ID',
  'Timestamp',
  'Date',
  'Time',
  'Role',
  'Status',
  'Part',
  'Part Minutes',
  'Glide Pace',
  'Register Shifts',
  'Warm-up Clarity',
  'Voice Breaks',
  'Notes Climbed',
  'Longest Sustain (s)',
  'Start Note',
  'Top Note',
  'Bottom Note',
  'Comfortable Range Marked',
  'Stretch and Flow Phase',
  'Breathing Coordination',
  'Endurance Pace',
  'Endurance Fatigue',
  'Glide Shapes',
  'Utterances',
  'Reading Material',
  'Part Notes',
  'VFE Minutes',
  'Stretch and Flow Minutes',
  'Endurance Minutes',
  'Session Minutes',
  'Effort Before',
  'Effort After',
  'Targets',
  'Wins',
  'Watch Items',
  'Notes for the SLP',
  // Appended after every existing column (spec 7.6). Existing columns keep
  // their relative order and absolute positions; downstream mappings that
  // reference them by index are unaffected.
  'Stretch and Flow Stage',
  'Voicing Ratio',
  'Tissue Used',
  'Steps Completed',
  'Max Breath Count',
  'Cues Checked',
  'Carryover Kind',
  'Carryover Items',
]

const PART_COLUMN_COUNT = 20

function formatNumber(value: number | null, fractionDigits = 0): string {
  return value === null ? '' : value.toFixed(fractionDigits)
}

/** The eight appended Stretch and Flow part columns, blank for other kinds. */
function stretchAndFlowColumns(segment: SessionSegmentInput): string[] {
  const detail = segment.stretchAndFlow
  if (!detail) return ['', '', '', '', '', '', '', '']
  const stage = detail.stageId ? STRETCH_AND_FLOW_STAGE_BY_ID.get(detail.stageId) : undefined
  const breathCounts = detail.steps
    .map((step) => step.breathCount)
    .filter((value): value is number => value !== null)
  const cuesChecked = detail.cuesChecked.map((cueId) => STRETCH_AND_FLOW_CUE_BY_ID.get(cueId)?.text ?? cueId).join('; ')
  const carryoverItems = (detail.carryover?.itemIds ?? [])
    .map((itemId) => STRETCH_AND_FLOW_CARRYOVER_BY_ID.get(itemId)?.text ?? itemId)
    .join('; ')
  return [
    stage?.label ?? detail.stageId ?? '',
    detail.ratio ? STRETCH_AND_FLOW_RATIO_LABELS[detail.ratio] : '',
    detail.usedTissue === null ? '' : detail.usedTissue ? 'Yes' : 'No',
    detail.steps.length > 0 ? `${detail.steps.filter((step) => step.completed).length}/${detail.steps.length}` : '',
    breathCounts.length > 0 ? String(Math.max(...breathCounts)) : '',
    cuesChecked,
    detail.carryover?.kind ? STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[detail.carryover.kind] : '',
    carryoverItems,
  ]
}

export function buildSessionsCsv(sessions: readonly Session[], tags: readonly Tag[], timeZone: string): string {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  const namesOfTags = (tagIds: readonly string[], tagKind: TagKind): string =>
    tagIds
      .map((tagId) => tagById.get(tagId))
      .filter((tag): tag is Tag => tag !== undefined && tag.kind === tagKind)
      .map((tag) => tag.name)
      .join('; ')

  const buildPartColumns = (segment: SessionSegmentInput): string[] => [
    SEGMENT_DEFINITIONS[segment.kind].label,
    formatNumber(segment.seconds / 60, 1),
    segment.glidePace === null ? '' : GLIDE_PACE_LABELS[segment.glidePace],
    formatNumber(segment.registerShifts),
    formatNumber(segment.clarityRating),
    formatNumber(segment.voiceBreaks),
    formatNumber(segment.notesClimbed),
    formatNumber(segment.longestSustainSeconds),
    segment.startNote,
    segment.topNote,
    segment.bottomNote,
    segment.identifiedComfortableRange ? 'Yes' : '',
    formatNumber(segment.phaseNumber),
    formatNumber(segment.coordinationRating),
    formatNumber(segment.paceRating),
    formatNumber(segment.fatigueRating),
    namesOfTags(segment.tagIds, 'glideShape'),
    namesOfTags(segment.tagIds, 'utterance'),
    namesOfTags(segment.tagIds, 'material'),
    segment.notes,
  ]

  const dataRows: string[][] = []
  for (const session of sessions) {
    const occurredAt = new Date(session.occurredAt)
    const trackMinutes = minutesByTrack(session)
    const sessionMinutes = session.segments.reduce((total, segment) => total + segment.seconds, 0) / 60
    const identityColumns = [
      session.id,
      session.occurredAt,
      dateFormatter.format(occurredAt),
      timeFormatter.format(occurredAt),
      SESSION_ROLE_LABELS[session.role],
      session.status === 'draft' ? 'Draft' : 'Complete',
    ]
    const aggregateColumns = [
      formatNumber(trackMinutes.vocalFunction, 1),
      formatNumber(trackMinutes.stretchAndFlow, 1),
      formatNumber(trackMinutes.endurance, 1),
      formatNumber(sessionMinutes, 1),
      String(session.effortBefore),
      session.effortAfter === null ? '' : String(session.effortAfter),
      namesOfTags(session.focusTagIds, 'focus'),
      namesOfTags(session.winTagIds, 'win'),
      namesOfTags(session.watchTagIds, 'watch'),
      session.slpNote,
    ]
    if (session.segments.length === 0) {
      dataRows.push([
        ...identityColumns,
        ...Array.from({ length: PART_COLUMN_COUNT }, () => ''),
        ...aggregateColumns,
        ...Array.from({ length: 8 }, () => ''),
      ])
      continue
    }
    for (const segment of session.segments) {
      dataRows.push([
        ...identityColumns,
        ...buildPartColumns(segment),
        ...aggregateColumns,
        ...stretchAndFlowColumns(segment),
      ])
    }
  }

  return buildCsvText(CSV_COLUMNS, dataRows)
}
