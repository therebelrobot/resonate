import type { SessionInput } from '../shared/model'

/**
 * The in-progress editor draft, kept in memory for the life of the tab so it
 * survives a lock/unlock. Locking unmounts the whole shell (App renders the
 * unlock screen instead), which would otherwise take the editor's own React
 * state with it - the bug that lost a nearly-finished session.
 *
 * This holds plaintext only while the tab is alive, exactly like the session
 * list in sessionData.tsx. The copy that outlives a reload or a killed tab is
 * the encrypted-at-rest draft row the editor autosaves to the server.
 *
 * Nothing here writes to localStorage, IndexedDB, or a service worker cache.
 */
export interface EditorDraftSnapshot {
  /** The editor's identity: 'new' for a new session, or the id of the session being edited. */
  editorKey: string
  draft: SessionInput
  minutesText: Record<string, string>
  stepIndex: number
  /** The server row id once autosave has stored a draft; null before the first autosave. */
  savedSessionId: string | null
  updatedAtMilliseconds: number
}

/** An untouched snapshot older than this is no longer offered for resume. */
export const EDITOR_DRAFT_MAX_AGE_MILLISECONDS = 12 * 60 * 60 * 1000

const snapshotsByEditorKey = new Map<string, EditorDraftSnapshot>()

export function readEditorDraft(editorKey: string): EditorDraftSnapshot | undefined {
  return snapshotsByEditorKey.get(editorKey)
}

export function writeEditorDraft(snapshot: EditorDraftSnapshot): void {
  snapshotsByEditorKey.set(snapshot.editorKey, snapshot)
}

export function clearEditorDraft(editorKey: string): void {
  snapshotsByEditorKey.delete(editorKey)
}

export function isEditorDraftFresh(snapshot: EditorDraftSnapshot, nowMilliseconds: number = Date.now()): boolean {
  return nowMilliseconds - snapshot.updatedAtMilliseconds <= EDITOR_DRAFT_MAX_AGE_MILLISECONDS
}
