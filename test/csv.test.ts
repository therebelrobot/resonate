import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSessionsCsv } from '../server/csvExport'
import { buildCsvText, escapeCsvField } from '../shared/csv'
import { createEmptySegmentInput, type Session, type SessionSegmentInput, type Tag, type TagKind } from '../shared/model'
import type { SegmentKind } from '../shared/protocol'

function segment(kind: SegmentKind, patch: Partial<SessionSegmentInput> = {}): SessionSegmentInput {
  return { ...createEmptySegmentInput(kind), ...patch }
}

function tag(id: string, kind: TagKind, name: string): Tag {
  return { id, kind, name, archived: false, createdAt: '2026-01-01T00:00:00.000Z' }
}

function session(occurredAt: string, segments: SessionSegmentInput[], patch: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    status: 'complete',
    role: 'warmup',
    effortBefore: 55,
    effortAfter: 35,
    focusTagIds: [],
    winTagIds: [],
    watchTagIds: [],
    slpNote: '',
    segments,
    ...patch,
  }
}

const MOUNTAIN_TAG = tag('11111111-1111-4111-8111-111111111111', 'glideShape', 'Mountain')
const OOH_TAG = tag('22222222-2222-4222-8222-222222222222', 'utterance', 'Ooh')

/** The 36 columns that existed before the Stretch and Flow additions (spec 7.6). */
const LEGACY_HEADER = [
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
]

describe('CSV field escaping', () => {
  it('neutralizes the characters a spreadsheet treats as a formula', () => {
    for (const hostile of ['=SUM(A1:A9)', '+1', '-1', '@SUM', '\tvalue']) {
      assert.ok(escapeCsvField(hostile).startsWith("'"), `expected ${JSON.stringify(hostile)} to be prefixed`)
    }
  })

  it('leaves ordinary words alone', () => {
    assert.equal(escapeCsvField('Breath support'), 'Breath support')
  })

  it('quotes fields containing commas, quotes, or newlines', () => {
    assert.equal(escapeCsvField('slow, steady'), '"slow, steady"')
    assert.equal(escapeCsvField('he said "eee"'), '"he said ""eee"""')
    assert.equal(escapeCsvField('line one\nline two'), '"line one\nline two"')
  })

  it('writes a UTF-8 BOM and CRLF line endings', () => {
    const csvText = buildCsvText(['A', 'B'], [['1', '2']])
    assert.ok(csvText.startsWith('\ufeff'))
    assert.ok(csvText.includes('\r\n'))
    assert.ok(csvText.endsWith('\r\n'))
  })
})

describe('session CSV export', () => {
  it('writes one row per part, plus a header', () => {
    const csvText = buildSessionsCsv(
      [
        session('2026-01-15T03:00:00.000Z', [
          segment('warmupNote', { seconds: 60, clarityRating: 80, voiceBreaks: 1 }),
          segment('glides', { seconds: 420, glidePace: 'slow', registerShifts: 4, tagIds: [MOUNTAIN_TAG.id, OOH_TAG.id] }),
        ]),
      ],
      [MOUNTAIN_TAG, OOH_TAG],
      'UTC',
    )
    const lines = csvText.trimEnd().split('\r\n')
    assert.equal(lines.length, 3)
    assert.ok(lines[0]!.includes('Session ID'))
    assert.ok(lines[1]!.includes('Warm-up note'))
    assert.ok(lines[2]!.includes('Glides'))
    assert.ok(lines[2]!.includes('Mountain'))
    assert.ok(lines[2]!.includes('Ooh'))
    assert.ok(lines[2]!.includes('Slow and steady'))
  })

  it('still writes a row for a session with no parts recorded', () => {
    const csvText = buildSessionsCsv([session('2026-01-15T03:00:00.000Z', [])], [], 'UTC')
    const lines = csvText.trimEnd().split('\r\n')
    assert.equal(lines.length, 2)
    assert.equal(lines[1]!.split(',').length, lines[0]!.split(',').length)
  })

  it('formats minutes to one decimal place', () => {
    const csvText = buildSessionsCsv([session('2026-01-15T03:00:00.000Z', [segment('glides', { seconds: 90 })])], [], 'UTC')
    assert.ok(csvText.includes('1.5'))
  })

  it('formats Date and Time in the configured zone, not the server default', () => {
    // 03:00 UTC is still the previous evening in New York - the classic off-by-one-day export bug.
    const exported = session('2026-01-15T03:00:00.000Z', [segment('glides', { seconds: 300 })])
    const utcCsv = buildSessionsCsv([exported], [], 'UTC')
    const newYorkCsv = buildSessionsCsv([exported], [], 'America/New_York')
    assert.ok(utcCsv.includes('2026-01-15'))
    assert.ok(utcCsv.includes('03:00'))
    assert.ok(newYorkCsv.includes('2026-01-14'))
    assert.ok(newYorkCsv.includes('22:00'))
    // The raw timestamp is always there, so nothing is lost either way.
    assert.ok(newYorkCsv.includes('2026-01-15T03:00:00.000Z'))
  })

  it('carries drafts through with a Status that says so', () => {
    const csvText = buildSessionsCsv([session('2026-01-15T03:00:00.000Z', [], { status: 'draft' })], [], 'UTC')
    assert.ok(csvText.includes('Draft'))
  })

  it('appends the Stretch and Flow columns without reordering the existing ones', () => {
    const csvText = buildSessionsCsv(
      [
        session('2026-01-15T03:00:00.000Z', [
          segment('stretchAndFlow', {
            seconds: 300,
            phaseNumber: 1,
            stretchAndFlow: {
              stageId: 'phase1',
              ratio: 'twentyEighty',
              usedTissue: true,
              steps: [{ stepId: 'oneNumber', completed: true, breathCount: 10 }],
              cuesChecked: ['elongateVowels'],
              toggledAirOnlyAndVoiced: null,
              carryover: { kind: 'singleWord', itemIds: ['free'], customText: '' },
            },
          }),
        ]),
      ],
      [],
      'UTC',
    )
    const lines = csvText.trimEnd().split('\r\n')
    const headerColumns = lines[0]!.replace(/^\ufeff/, '').split(',')
    // The legacy columns keep their absolute positions: VFE Minutes is still
    // index 26 and Notes for the SLP is still index 35.
    assert.equal(headerColumns.indexOf('VFE Minutes'), 26)
    assert.equal(headerColumns.indexOf('Notes for the SLP'), 35)
    assert.deepEqual(headerColumns.slice(0, 36), LEGACY_HEADER)
    // The eight new columns are appended after every existing one.
    assert.equal(headerColumns.indexOf('Stretch and Flow Stage'), 36)
    assert.equal(headerColumns.indexOf('Carryover Items'), 43)
    const row = lines[1]!
    assert.ok(row.includes('Phase 1'))
    assert.ok(row.includes('20% sound / 80% air'))
    assert.ok(row.includes('1/1'))
    assert.ok(row.includes('Vowels elongated'))
    assert.ok(row.includes('Free'))
  })
})
