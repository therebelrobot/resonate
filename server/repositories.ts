import { randomUUID } from 'node:crypto'
import type { Database } from './database'
import type {
  AuditEvent,
  ProtocolDocument,
  ProtocolDocumentId,
  Recording,
  SegmentKind,
  Session,
  SessionInput,
  Tag,
  TagInput,
} from '../shared/model'
import { PROTOCOL_DOCUMENT_IDS, isProtocolDocumentId, normalizeSegmentInput, sortSegmentsByProtocolOrder } from '../shared/model'
import { decryptBytes, decryptJson, encryptBytes, encryptJson, recordAdditionalAuthenticatedData } from './crypto/envelope'
import { DEFAULT_TAGS } from './seedTags'

export class RecordNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordNotFoundError'
  }
}

export class RecordConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordConflictError'
  }
}

export class RecordValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordValidationError'
  }
}

interface EncryptedRow {
  id: string
  payload: Uint8Array
}

export class TagRepository {
  constructor(private readonly database: Database) { }

  listAll(dataEncryptionKey: Buffer): Tag[] {
    const rows = this.database.prepare('SELECT id, payload FROM tags').all() as unknown as EncryptedRow[]
    return rows
      .map((row) => decryptJson<Tag>(dataEncryptionKey, row.payload, recordAdditionalAuthenticatedData('tags', row.id)))
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  create(dataEncryptionKey: Buffer, tagInput: TagInput, createdAtIso: string): Tag {
    const tag: Tag = { id: randomUUID(), ...tagInput, createdAt: createdAtIso }
    this.database
      .prepare('INSERT INTO tags (id, payload) VALUES (?, ?)')
      .run(tag.id, encryptJson(dataEncryptionKey, tag, recordAdditionalAuthenticatedData('tags', tag.id)))
    return tag
  }

  replace(dataEncryptionKey: Buffer, tagId: string, tagInput: TagInput): Tag {
    const existingTag = this.get(dataEncryptionKey, tagId)
    const tag: Tag = { ...existingTag, ...tagInput }
    this.database
      .prepare('UPDATE tags SET payload = ? WHERE id = ?')
      .run(encryptJson(dataEncryptionKey, tag, recordAdditionalAuthenticatedData('tags', tagId)), tagId)
    return tag
  }

  delete(tagId: string): void {
    this.database.prepare('DELETE FROM tags WHERE id = ?').run(tagId)
  }

  get(dataEncryptionKey: Buffer, tagId: string): Tag {
    const row = this.database.prepare('SELECT id, payload FROM tags WHERE id = ?').get(tagId) as EncryptedRow | undefined
    if (!row) throw new RecordNotFoundError('That tag no longer exists.')
    return decryptJson<Tag>(dataEncryptionKey, row.payload, recordAdditionalAuthenticatedData('tags', row.id))
  }

  seedDefaults(dataEncryptionKey: Buffer, createdAtIso: string): Tag[] {
    return DEFAULT_TAGS.map(({ kind, name }) => this.create(dataEncryptionKey, { kind, name, archived: false }, createdAtIso))
  }
}

/**
 * Legacy rows predate `stretchAndFlow`, so the key is absent on read. Fill it
 * with null here so every Session handed to metrics/UI has the key present
 * (spec 3.3). Read-time normalization, not a data migration.
 */
function normalizeSession(session: Session): Session {
  return { ...session, segments: session.segments.map(normalizeSegmentInput) }
}

export class SessionRepository {
  constructor(private readonly database: Database) { }

  listAll(dataEncryptionKey: Buffer): Session[] {
    const rows = this.database.prepare('SELECT id, payload FROM sessions').all() as unknown as EncryptedRow[]
    return rows
      .map((row) => normalizeSession(decryptJson<Session>(dataEncryptionKey, row.payload, recordAdditionalAuthenticatedData('sessions', row.id))))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }

  get(dataEncryptionKey: Buffer, sessionId: string): Session {
    const row = this.database.prepare('SELECT id, payload FROM sessions WHERE id = ?').get(sessionId) as EncryptedRow | undefined
    if (!row) throw new RecordNotFoundError('That session no longer exists.')
    return normalizeSession(decryptJson<Session>(dataEncryptionKey, row.payload, recordAdditionalAuthenticatedData('sessions', row.id)))
  }

  create(dataEncryptionKey: Buffer, sessionInput: SessionInput, createdAtIso: string): Session {
    const session: Session = {
      ...sessionInput,
      segments: sortSegmentsByProtocolOrder(sessionInput.segments),
      id: randomUUID(),
      createdAt: createdAtIso,
      updatedAt: createdAtIso,
    }
    this.database
      .prepare('INSERT INTO sessions (id, payload) VALUES (?, ?)')
      .run(session.id, encryptJson(dataEncryptionKey, session, recordAdditionalAuthenticatedData('sessions', session.id)))
    return session
  }

  replace(dataEncryptionKey: Buffer, sessionId: string, sessionInput: SessionInput, updatedAtIso: string): Session {
    const existingSession = this.get(dataEncryptionKey, sessionId)
    const session: Session = {
      ...sessionInput,
      segments: sortSegmentsByProtocolOrder(sessionInput.segments),
      id: existingSession.id,
      createdAt: existingSession.createdAt,
      updatedAt: updatedAtIso,
    }
    this.database
      .prepare('UPDATE sessions SET payload = ? WHERE id = ?')
      .run(encryptJson(dataEncryptionKey, session, recordAdditionalAuthenticatedData('sessions', sessionId)), sessionId)
    return session
  }

  delete(sessionId: string): void {
    this.database.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  }
}

/** Server-side input for a recording: metadata plus the raw audio bytes. */
export interface RecordingInput {
  segmentKind: SegmentKind | null
  label: string
  mimeType: string
  durationSeconds: number | null
  audio: Buffer
}

interface EncryptedRecordingRow {
  id: string
  session_id: string
  payload: Uint8Array
  audio: Uint8Array
}

/** AAD for a recording's audio; distinct from its metadata so the two cannot be swapped. */
function recordingAudioAad(recordingId: string): string {
  return `resonate:record:recording_audio:${recordingId}`
}

export class RecordingRepository {
  constructor(private readonly database: Database) { }

  listAll(dataEncryptionKey: Buffer): Recording[] {
    const rows = this.database
      .prepare('SELECT id, session_id, payload FROM recordings')
      .all() as unknown as Omit<EncryptedRecordingRow, 'audio'>[]
    return rows
      .map((row) => this.decodeMetadata(dataEncryptionKey, row))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  listForSession(dataEncryptionKey: Buffer, sessionId: string): Recording[] {
    const rows = this.database
      .prepare('SELECT id, session_id, payload FROM recordings WHERE session_id = ?')
      .all(sessionId) as unknown as Omit<EncryptedRecordingRow, 'audio'>[]
    return rows
      .map((row) => this.decodeMetadata(dataEncryptionKey, row))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  get(dataEncryptionKey: Buffer, recordingId: string): Recording {
    const row = this.database
      .prepare('SELECT id, session_id, payload FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as Omit<EncryptedRecordingRow, 'audio'> | undefined
    if (!row) throw new RecordNotFoundError('That recording no longer exists.')
    return this.decodeMetadata(dataEncryptionKey, row)
  }

  /** The audio bytes for one recording, decrypted on demand. */
  getAudio(dataEncryptionKey: Buffer, recordingId: string): { recording: Recording; audio: Buffer } {
    const row = this.database
      .prepare('SELECT id, session_id, payload, audio FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as EncryptedRecordingRow | undefined
    if (!row) throw new RecordNotFoundError('That recording no longer exists.')
    const recording = this.decodeMetadata(dataEncryptionKey, row)
    const audio = decryptBytes(dataEncryptionKey, row.audio, recordingAudioAad(row.id))
    return { recording, audio }
  }

  create(dataEncryptionKey: Buffer, sessionId: string, input: RecordingInput, createdAtIso: string): Recording {
    const recording: Recording = {
      id: randomUUID(),
      sessionId,
      segmentKind: input.segmentKind,
      label: input.label,
      mimeType: input.mimeType,
      durationSeconds: input.durationSeconds,
      byteLength: input.audio.byteLength,
      createdAt: createdAtIso,
    }
    this.database
      .prepare('INSERT INTO recordings (id, session_id, payload, audio) VALUES (?, ?, ?, ?)')
      .run(
        recording.id,
        sessionId,
        encryptJson(dataEncryptionKey, recording, recordAdditionalAuthenticatedData('recordings', recording.id)),
        encryptBytes(dataEncryptionKey, input.audio, recordingAudioAad(recording.id)),
      )
    return recording
  }

  delete(recordingId: string): void {
    this.database.prepare('DELETE FROM recordings WHERE id = ?').run(recordingId)
  }

  deleteForSession(sessionId: string): void {
    this.database.prepare('DELETE FROM recordings WHERE session_id = ?').run(sessionId)
  }

  private decodeMetadata(
    dataEncryptionKey: Buffer,
    row: Omit<EncryptedRecordingRow, 'audio'>,
  ): Recording {
    const stored = decryptJson<Omit<Recording, 'sessionId'>>(
      dataEncryptionKey,
      row.payload,
      recordAdditionalAuthenticatedData('recordings', row.id),
    )
    return { ...stored, id: row.id, sessionId: row.session_id }
  }
}

export class ProtocolDocumentRepository {
  constructor(private readonly database: Database) { }

  /** Always returns one entry per known document id, empty when never written. */
  listAll(dataEncryptionKey: Buffer): ProtocolDocument[] {
    const rows = this.database.prepare('SELECT id, payload FROM documents').all() as unknown as EncryptedRow[]
    const storedById = new Map<ProtocolDocumentId, ProtocolDocument>()
    for (const row of rows) {
      if (!isProtocolDocumentId(row.id)) continue
      const stored = decryptJson<{ text: string; updatedAt: string }>(
        dataEncryptionKey,
        row.payload,
        recordAdditionalAuthenticatedData('documents', row.id),
      )
      storedById.set(row.id, { id: row.id, text: stored.text, updatedAt: stored.updatedAt })
    }
    return PROTOCOL_DOCUMENT_IDS.map((documentId) => storedById.get(documentId) ?? { id: documentId, text: '', updatedAt: null })
  }

  replace(dataEncryptionKey: Buffer, documentId: ProtocolDocumentId, text: string, updatedAtIso: string): ProtocolDocument {
    const stored = { text, updatedAt: updatedAtIso }
    this.database
      .prepare('INSERT INTO documents (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload')
      .run(documentId, encryptJson(dataEncryptionKey, stored, recordAdditionalAuthenticatedData('documents', documentId)))
    return { id: documentId, text, updatedAt: updatedAtIso }
  }
}

export class AuditLog {
  constructor(private readonly database: Database) { }

  record(event: string, ipAddress: string, userAgent: string, atIso: string): void {
    this.database
      .prepare('INSERT INTO audit_log (at, event, ip_address, user_agent) VALUES (?, ?, ?, ?)')
      .run(atIso, event, ipAddress, userAgent)
  }

  listRecent(limit: number): AuditEvent[] {
    const rows = this.database
      .prepare('SELECT id, at, event, ip_address, user_agent FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as { id: number; at: string; event: string; ip_address: string; user_agent: string }[]
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      event: row.event,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    }))
  }
}

/**
 * Tag ids arrive from the client, so every referenced id has to exist before the
 * session is stored: a dangling reference would show up as a blank chip later.
 */
export function assertSessionTagReferencesAreValid(sessionInput: SessionInput, availableTags: readonly Tag[]): void {
  const availableTagIds = new Set(availableTags.map((tag) => tag.id))
  const referencedTagIds = new Set<string>([
    ...sessionInput.focusTagIds,
    ...sessionInput.winTagIds,
    ...sessionInput.watchTagIds,
    ...sessionInput.segments.flatMap((segment) => segment.tagIds),
  ])
  for (const tagId of referencedTagIds) {
    if (!availableTagIds.has(tagId)) {
      throw new RecordValidationError('This session references a tag that no longer exists. Reload and try again.')
    }
  }
}
