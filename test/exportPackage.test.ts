import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createZipArchive, crc32 } from '../shared/zip'
import { encodePcm16Wav } from '../shared/wav'
import { PdfWriter, encodeWinAnsi, measureTextWidth } from '../shared/pdf'
import {
  recordingStamp,
  segmentKindSlug,
  sessionAudioBaseName,
  sessionPackageFileName,
  sessionStamp,
  uniqueAudioFileName,
} from '../client/sessionPackage'
import { buildSessionReportPdf } from '../client/sessionReport'
import type { Recording, Session, Tag } from '../shared/model'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('latin1')
const utf8Decoder = new TextDecoder('utf-8')

/** A local wall-clock moment, so the formatted stamp matches in any time zone. */
function localIso(year: number, monthIndex: number, day: number, hours: number, minutes: number): string {
  return new Date(year, monthIndex, day, hours, minutes, 0).toISOString()
}

function sampleSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    occurredAt: localIso(2026, 9, 20, 9, 30),
    createdAt: localIso(2026, 9, 20, 9, 30),
    updatedAt: localIso(2026, 9, 20, 9, 45),
    status: 'complete',
    role: 'warmup',
    effortBefore: 60,
    effortAfter: 40,
    focusTagIds: [],
    winTagIds: [],
    watchTagIds: [],
    slpNote: 'The warm-up felt easier this week.',
    segments: [
      {
        kind: 'warmupNote',
        seconds: 90,
        repetitions: 3,
        clarityRating: 80,
        voiceBreaks: 1,
        glidePace: null,
        registerShifts: null,
        startNote: '',
        topNote: '',
        bottomNote: '',
        notesClimbed: null,
        longestSustainSeconds: null,
        identifiedComfortableRange: false,
        phaseNumber: null,
        coordinationRating: null,
        stretchAndFlow: null,
        pitch: null,
        resonance: null,
        carryover: null,
        paceRating: null,
        fatigueRating: null,
        tagIds: [],
        notes: 'Clear vibration on the second take.',
      },
    ],
    ...overrides,
  }
}

function sampleRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    sessionId: '11111111-1111-4111-8111-111111111111',
    segmentKind: 'warmupNote',
    label: 'Warm-up note',
    mimeType: 'audio/webm;codecs=opus',
    durationSeconds: 7,
    byteLength: 4,
    createdAt: localIso(2026, 9, 20, 9, 34),
    ...overrides,
  }
}

// ---------- zip ----------

/** A minimal ZIP reader, enough to prove the writer's offsets and CRCs line up. */
function readZipEntries(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // End of central directory is the last record when there is no archive comment.
  const eocdOffset = bytes.length - 22
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50, 'EOCD signature')
  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)

  const entries: { name: string; data: Uint8Array; crc: number }[] = []
  let cursor = centralDirectoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, 'central directory signature')
    const method = view.getUint16(cursor + 10, true)
    assert.equal(method, 0, 'store method')
    const crc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = utf8Decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, 'local file header signature')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    entries.push({ name, data: bytes.subarray(dataOffset, dataOffset + size), crc })

    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

describe('zip writer', () => {
  it('matches the standard CRC-32 test vector', () => {
    assert.equal(crc32(textEncoder.encode('123456789')), 0xcbf43926)
    assert.equal(crc32(new Uint8Array()), 0)
  })

  it('round-trips entries, including UTF-8 names', () => {
    const archive = createZipArchive(
      [
        { path: 'report.pdf', data: textEncoder.encode('hello') },
        { path: 'audio/naïve_0934.wav', data: new Uint8Array([0, 1, 2, 255]) },
      ],
      new Date(2026, 9, 20, 9, 30, 0),
    )
    const entries = readZipEntries(archive)
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['report.pdf', 'audio/naïve_0934.wav'],
    )
    assert.equal(textDecoder.decode(entries[0]!.data), 'hello')
    assert.deepEqual([...entries[1]!.data], [0, 1, 2, 255])
    assert.equal(entries[0]!.crc, crc32(textEncoder.encode('hello')))
  })

  it('produces a store-mode archive an external tool accepts', (t) => {
    let available = true
    try {
      execFileSync('unzip', ['-v'], { stdio: 'ignore' })
    } catch {
      available = false
    }
    if (!available) {
      t.skip('unzip is not installed')
      return
    }
    const archive = createZipArchive([{ path: 'audio/clip.wav', data: textEncoder.encode('RIFF....') }])
    const directory = mkdtempSync(path.join(tmpdir(), 'resonate-zip-'))
    const archivePath = path.join(directory, 'package.zip')
    writeFileSync(archivePath, archive)
    const output = execFileSync('unzip', ['-l', archivePath], { encoding: 'utf8' })
    assert.match(output, /audio\/clip\.wav/)
  })
})

// ---------- wav ----------

describe('wav encoder', () => {
  it('writes a well-formed mono PCM header and samples', () => {
    const wav = encodePcm16Wav([new Float32Array([0, 1, -1])], 48_000)
    const view = new DataView(wav.buffer)
    assert.equal(textDecoder.decode(wav.subarray(0, 4)), 'RIFF')
    assert.equal(textDecoder.decode(wav.subarray(8, 12)), 'WAVE')
    assert.equal(view.getUint16(20, true), 1) // PCM
    assert.equal(view.getUint16(22, true), 1) // channels
    assert.equal(view.getUint32(24, true), 48_000)
    assert.equal(view.getUint16(34, true), 16) // bits per sample
    assert.equal(wav.length, 44 + 3 * 2)
    assert.equal(view.getInt16(44, true), 0)
    assert.equal(view.getInt16(46, true), 32767)
    assert.equal(view.getInt16(48, true), -32768)
  })

  it('interleaves stereo channels', () => {
    const wav = encodePcm16Wav([new Float32Array([1, 0]), new Float32Array([0, 1])], 44_100)
    const view = new DataView(wav.buffer)
    assert.equal(view.getUint16(22, true), 2)
    assert.equal(view.getInt16(44, true), 32767) // frame 0, left
    assert.equal(view.getInt16(46, true), 0) // frame 0, right
    assert.equal(view.getInt16(48, true), 0) // frame 1, left
    assert.equal(view.getInt16(50, true), 32767) // frame 1, right
  })

  it('rejects a WAV with no channels or no sample rate', () => {
    assert.throws(() => encodePcm16Wav([], 48_000))
    assert.throws(() => encodePcm16Wav([new Float32Array([0])], 0))
  })
})

// ---------- pdf ----------

describe('pdf writer', () => {
  it('produces a document with a valid cross-reference table', () => {
    const writer = new PdfWriter('Test report')
    writer.heading('Session report', 1)
    writer.paragraph('Some words.')
    const pdf = writer.finish()
    const text = textDecoder.decode(pdf)

    assert.match(text, /^%PDF-1\.4\n/)
    assert.match(text, /\/Type \/Catalog/)
    assert.match(text, /%%EOF\n$/)

    // Every xref entry must point at that object's "N 0 obj" header.
    const xrefMatch = /xref\n0 (\d+)\n([\s\S]*?)trailer\n<< \/Size \d+/.exec(text)
    assert.ok(xrefMatch, 'xref table present')
    const objectCount = Number(xrefMatch[1])
    const entries = xrefMatch[2]!.trimEnd().split('\n').slice(1) // drop the free entry
    assert.equal(entries.length, objectCount - 1)
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10))
      assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`)
    })
  })

  it('paginates when content runs past the page', () => {
    const writer = new PdfWriter('Long report')
    for (let index = 0; index < 200; index += 1) writer.paragraph(`Line ${index}: the quick brown fox jumps over the lazy dog.`)
    const text = textDecoder.decode(writer.finish())
    const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length
    assert.ok(pageCount > 1, `expected multiple pages, saw ${pageCount}`)
  })

  it('wraps long lines within the text column', () => {
    const writer = new PdfWriter('Wrap')
    writer.paragraph('word '.repeat(200).trim())
    const text = textDecoder.decode(writer.finish())
    const drawnLines = text.match(/\] \(.*?\) Tj ET|\(.*?\) Tj ET/g) ?? []
    assert.ok(drawnLines.length > 1)
    assert.ok(measureTextWidth('word '.repeat(200).trim(), 10.5) > 500)
  })

  it('maps punctuation to WinAnsi and replaces what the font cannot show', () => {
    assert.equal(encodeWinAnsi('“hi” — olé'), '\u0093hi\u0094 \u0097 olé')
    assert.equal(encodeWinAnsi('👍'), '?')
  })
})

// ---------- naming ----------

describe('session package naming', () => {
  it('stamps the session and the recording times', () => {
    assert.equal(sessionStamp(localIso(2026, 9, 20, 9, 30)), '2026-10-20_0930')
    assert.equal(
      recordingStamp(localIso(2026, 9, 20, 9, 30), localIso(2026, 9, 20, 9, 34)),
      '0934',
    )
    // A clip recorded after midnight carries its own date.
    assert.equal(
      recordingStamp(localIso(2026, 9, 20, 23, 55), localIso(2026, 9, 21, 0, 12)),
      '2026-10-21_0012',
    )
  })

  it('slugs segment kinds and names clips after the session', () => {
    assert.equal(segmentKindSlug('warmupNote'), 'warmup-note')
    assert.equal(segmentKindSlug('powerAscending'), 'power-ascending')
    assert.equal(segmentKindSlug(null), 'session')

    const session = sampleSession()
    const recording = sampleRecording()
    assert.equal(sessionAudioBaseName(session, recording), '2026-10-20_0930_warmup-note_0934')
    assert.equal(sessionPackageFileName(session), 'resonate-session-2026-10-20_0930.zip')
  })

  it('de-duplicates repeated names before the extension', () => {
    const used = new Set<string>()
    assert.equal(uniqueAudioFileName('clip.wav', used), 'clip.wav')
    assert.equal(uniqueAudioFileName('clip.wav', used), 'clip-2.wav')
    assert.equal(uniqueAudioFileName('clip.wav', used), 'clip-3.wav')
    assert.equal(uniqueAudioFileName('no-extension', used), 'no-extension')
    assert.equal(uniqueAudioFileName('no-extension', used), 'no-extension-2')
  })
})

// ---------- report ----------

describe('session report pdf', () => {
  const tagById = new Map<string, Tag>()

  it('renders the session, its parts, and its recordings', () => {
    const session = sampleSession()
    const pdf = buildSessionReportPdf(session, tagById, {
      includeWrittenText: true,
      audioFiles: [{ recording: sampleRecording(), fileName: '2026-10-20_0930_warmup-note_0934.wav' }],
    })
    const text = textDecoder.decode(pdf)
    assert.match(text, /Session report/)
    assert.match(text, /Warm-up note/)
    assert.match(text, /Vibration clarity: 80 of 100/)
    assert.match(text, /2026-10-20_0930_warmup-note_0934\.wav/)
    assert.match(text, /The warm-up felt easier this week\./)
    assert.match(text, /Clear vibration on the second take\./)
  })

  it('omits written notes when asked to', () => {
    const session = sampleSession()
    const pdf = buildSessionReportPdf(session, tagById, { includeWrittenText: false, audioFiles: [] })
    const text = textDecoder.decode(pdf)
    assert.ok(!text.includes('The warm-up felt easier this week.'))
    assert.ok(!text.includes('Clear vibration on the second take.'))
    assert.match(text, /Vibration clarity: 80 of 100/)
  })
})
