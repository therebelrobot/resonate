import { api } from './api'
import { buildSessionReportPdf, type SessionReportAudioFile } from './sessionReport'
import { createZipArchive, type ZipEntry } from '../shared/zip'
import { encodePcm16Wav } from '../shared/wav'
import type { Recording, SegmentKind, Session, Tag } from '../shared/model'

/**
 * Names a session's moment as `YYYY-MM-DD_HHMM` in the device's zone, the same
 * zone the rest of the app formats in.
 */
export function sessionStamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * The time of the recording itself as `HHMM`, or the full `YYYY-MM-DD_HHMM` when
 * the clip was recorded on a different day than the session it belongs to (a
 * session left open overnight, say).
 */
export function recordingStamp(sessionIso: string, recordedIso: string): string {
  const session = new Date(sessionIso)
  const recorded = new Date(recordedIso)
  const pad = (value: number) => String(value).padStart(2, '0')
  const clock = `${pad(recorded.getHours())}${pad(recorded.getMinutes())}`
  const sameDay =
    session.getFullYear() === recorded.getFullYear() &&
    session.getMonth() === recorded.getMonth() &&
    session.getDate() === recorded.getDate()
  if (sameDay) return clock
  return `${recorded.getFullYear()}-${pad(recorded.getMonth() + 1)}-${pad(recorded.getDate())}_${clock}`
}

/** `warmupNote` becomes `warmup-note`; a session-level clip is just `session`. */
export function segmentKindSlug(kind: SegmentKind | null): string {
  if (kind === null) return 'session'
  return kind.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * The base of an audio file's name: the session's moment, then the step, then the
 * recording's own time. `2026-10-20_0930_warmup-note_0934`. The extension is
 * decided when the clip is encoded.
 */
export function sessionAudioBaseName(session: Session, recording: Recording): string {
  return [
    sessionStamp(session.occurredAt),
    segmentKindSlug(recording.segmentKind),
    recordingStamp(session.occurredAt, recording.createdAt),
  ].join('_')
}

/** The name the whole export downloads under. */
export function sessionPackageFileName(session: Session): string {
  return `resonate-session-${sessionStamp(session.occurredAt)}.zip`
}

/** Appends `-2`, `-3`, ... before the extension so two clips never collide. */
export function uniqueAudioFileName(baseWithExtension: string, usedNames: Set<string>): string {
  if (!usedNames.has(baseWithExtension)) {
    usedNames.add(baseWithExtension)
    return baseWithExtension
  }
  const dotIndex = baseWithExtension.lastIndexOf('.')
  const stem = dotIndex === -1 ? baseWithExtension : baseWithExtension.slice(0, dotIndex)
  const extension = dotIndex === -1 ? '' : baseWithExtension.slice(dotIndex)
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
  }
}

/** The file extension to keep when a clip cannot be decoded and is passed through as-is. */
function extensionForMimeType(mimeType: string): string {
  const subtype = mimeType.split(';')[0]!.split('/')[1]?.toLowerCase() ?? ''
  if (subtype === 'mpeg') return 'mp3'
  if (subtype === 'mp4') return 'm4a'
  if (subtype === 'x-m4a') return 'm4a'
  if (subtype === 'wav' || subtype === 'x-wav' || subtype === 'wave') return 'wav'
  if (/^[a-z0-9]+$/.test(subtype)) return subtype
  return 'bin'
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext

function audioContextConstructor(): AudioContextConstructor {
  const vendorWindow = window as Window & { webkitAudioContext?: AudioContextConstructor }
  const Constructor = window.AudioContext ?? vendorWindow.webkitAudioContext
  if (!Constructor) throw new Error('This browser cannot decode audio for export.')
  return Constructor
}

/** Decodes a stored recording to PCM and encodes it as a playable WAV. */
async function decodeRecordingToWav(audioBytes: ArrayBuffer): Promise<Uint8Array> {
  const audioContext = new (audioContextConstructor())()
  try {
    // decodeAudioData takes ownership of the buffer it is handed, so give it a
    // copy and leave the caller's bytes intact for a fallback.
    const audioBuffer = await audioContext.decodeAudioData(audioBytes.slice(0))
    const channels: Float32Array[] = []
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      channels.push(audioBuffer.getChannelData(channel))
    }
    return encodePcm16Wav(channels, audioBuffer.sampleRate)
  } finally {
    void audioContext.close().catch(() => undefined)
  }
}

async function fetchRecordingAudio(recordingId: string): Promise<ArrayBuffer> {
  const response = await fetch(api.recordingAudioUrl(recordingId), {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not fetch a recording (${response.status}).`)
  return response.arrayBuffer()
}

export interface SessionPackageProgress {
  completed: number
  total: number
  label: string
}

export interface ExportSessionPackageOptions {
  session: Session
  tagById: Map<string, Tag>
  recordings: readonly Recording[]
  includeWrittenText: boolean
  onProgress?: (progress: SessionPackageProgress) => void
}

export interface SessionPackageResult {
  fileName: string
  byteLength: number
  /** Recordings that could not be decoded and were passed through in their original format. */
  undecodedCount: number
}

/**
 * Builds one zip for a session: the SLP report as a PDF, plus every recording as
 * a playable WAV named for its session, its step, and its time. Everything is
 * assembled in the browser - the audio is streamed back through the
 * cookie-authenticated endpoint and never touches a third party.
 */
export async function buildSessionPackage(options: ExportSessionPackageOptions): Promise<{ zip: Uint8Array; result: SessionPackageResult }> {
  const { session, tagById, recordings, includeWrittenText, onProgress } = options
  const usedNames = new Set<string>()
  const zipEntries: ZipEntry[] = []
  const audioFiles: SessionReportAudioFile[] = []
  let undecodedCount = 0

  for (const [index, recording] of recordings.entries()) {
    onProgress?.({
      completed: index,
      total: recordings.length,
      label: recording.label.trim() || 'recording',
    })
    const baseName = sessionAudioBaseName(session, recording)
    const audioBytes = await fetchRecordingAudio(recording.id)
    let data: Uint8Array
    let extension: string
    try {
      data = await decodeRecordingToWav(audioBytes)
      extension = 'wav'
    } catch {
      // A clip this browser cannot decode is still worth shipping: keep the bytes
      // as recorded, with their own extension, rather than losing it from the zip.
      undecodedCount += 1
      data = new Uint8Array(audioBytes)
      extension = extensionForMimeType(recording.mimeType)
    }
    const fileName = uniqueAudioFileName(`${baseName}.${extension}`, usedNames)
    zipEntries.push({ path: `audio/${fileName}`, data })
    audioFiles.push({ recording, fileName })
  }

  onProgress?.({
    completed: recordings.length,
    total: recordings.length,
    label: 'building the report',
  })

  const reportPdf = buildSessionReportPdf(session, tagById, { includeWrittenText, audioFiles })
  // The report goes first so it is the entry a reader sees when they open the zip.
  const zip = createZipArchive([{ path: 'report.pdf', data: reportPdf }, ...zipEntries])

  return {
    zip,
    result: { fileName: sessionPackageFileName(session), byteLength: zip.byteLength, undecodedCount },
  }
}

/** Saves bytes to the user's downloads, the same way the CSV export does. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Builds and downloads the session package, then records the export in the
 * access log. Returns a short summary for the UI.
 */
export async function exportSessionPackage(options: ExportSessionPackageOptions): Promise<SessionPackageResult> {
  const { zip, result } = await buildSessionPackage(options)
  downloadBytes(zip, result.fileName, 'application/zip')
  void api.recordClientExport('session_package').catch(() => undefined)
  return result
}
