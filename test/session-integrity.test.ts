import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRoute } from '../client/router'
import {
  clearEditorDraft,
  EDITOR_DRAFT_MAX_AGE_MILLISECONDS,
  isEditorDraftFresh,
  readEditorDraft,
  writeEditorDraft,
  type EditorDraftSnapshot,
} from '../client/editorDraftStore'
import { createEmptySessionInput } from '../shared/model'

describe('session-integrity routing', () => {
  it('parses the plain Log route with no draft id', () => {
    assert.deepEqual(parseRoute('#/log'), { screen: 'new-session' })
  })

  it('parses a Log route carrying an autosaved draft id', () => {
    assert.deepEqual(parseRoute('#/log/draft-abc'), { screen: 'new-session', draftId: 'draft-abc' })
  })

  it('still parses the edit route', () => {
    assert.deepEqual(parseRoute('#/sessions/s1/edit'), { screen: 'edit-session', sessionId: 's1' })
  })

  it('falls back to Today for an unknown route', () => {
    assert.deepEqual(parseRoute('#/nope'), { screen: 'today' })
  })
})

function snapshot(overrides: Partial<EditorDraftSnapshot> = {}): EditorDraftSnapshot {
  return {
    editorKey: 'new',
    draft: createEmptySessionInput(),
    minutesText: {},
    stepIndex: 0,
    savedSessionId: null,
    updatedAtMilliseconds: Date.now(),
    ...overrides,
  }
}

describe('in-memory editor draft store', () => {
  it('returns what was written, keyed by editor', () => {
    writeEditorDraft(snapshot({ editorKey: 'new', stepIndex: 3 }))
    assert.equal(readEditorDraft('new')?.stepIndex, 3)
    assert.equal(readEditorDraft('some-other-editor'), undefined)
  })

  it('clears a snapshot', () => {
    writeEditorDraft(snapshot({ editorKey: 'to-clear' }))
    clearEditorDraft('to-clear')
    assert.equal(readEditorDraft('to-clear'), undefined)
  })

  it('treats a snapshot older than the window as stale', () => {
    const now = Date.now()
    const old = snapshot({ updatedAtMilliseconds: now - EDITOR_DRAFT_MAX_AGE_MILLISECONDS - 1 })
    assert.equal(isEditorDraftFresh(old, now), false)
    const fresh = snapshot({ updatedAtMilliseconds: now - 1000 })
    assert.equal(isEditorDraftFresh(fresh, now), true)
  })
})
