import { useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { TAG_KINDS, TAG_KIND_LABELS, type Tag, type TagKind } from '../../shared/model'
import type { TagWithUsage } from '../api'

export function TagsScreen() {
  const { tags, refresh, isLoading, loadError } = useSessionData()
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newNameByKind, setNewNameByKind] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const runAction = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'That did not work.')
    }
  }

  const saveRename = async (tag: TagWithUsage) => {
    const trimmedName = draftName.trim()
    if (!trimmedName) {
      setEditingTagId(null)
      return
    }
    await runAction(() => api.replaceTag(tag.id, { kind: tag.kind, name: trimmedName, archived: tag.archived }))
    setEditingTagId(null)
  }

  const addTag = async (tagKind: TagKind) => {
    const trimmedName = (newNameByKind[tagKind] ?? '').trim()
    if (!trimmedName) return
    await runAction(() => api.createTag({ kind: tagKind, name: trimmedName, archived: false }))
    setNewNameByKind((previous) => ({ ...previous, [tagKind]: '' }))
  }

  if (isLoading) return <p className="screen-message">Opening your practice log...</p>
  if (loadError) return <p className="screen-message form-error">{loadError}</p>

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Tags</h1>
        <p className="screen-subtitle">
          Your vocabulary for the log. Rename anything, archive what you no longer use, and add words for the things your SLP
          actually asks about. Deleting is blocked while a tag is on a session, so history never develops holes.
        </p>
      </header>

      {error && <p className="form-error">{error}</p>}

      {TAG_KINDS.map((tagKind) => {
        const kindTags = tags
          .filter((tag) => tag.kind === tagKind)
          .sort((left, right) => Number(left.archived) - Number(right.archived) || left.name.localeCompare(right.name))
        const kindLabel = TAG_KIND_LABELS[tagKind]

        return (
          <section key={tagKind} className="detail-section">
            <h2>{kindLabel.plural}</h2>
            <p className="field-hint">{kindLabel.prompt}</p>

            {kindTags.length === 0 && <p className="empty-hint">None yet.</p>}

            <ul className="tag-list">
              {kindTags.map((tag) => (
                <li key={tag.id} className={tag.archived ? 'tag-row is-archived' : 'tag-row'}>
                  {editingTagId === tag.id ? (
                    <div className="inline-add">
                      <input
                        type="text"
                        value={draftName}
                        maxLength={60}
                        aria-label="Tag name"
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void saveRename(tag)
                          }
                          if (event.key === 'Escape') setEditingTagId(null)
                        }}
                      />
                      <button type="button" className="button button-secondary button-small" onClick={() => void saveRename(tag)}>
                        Save
                      </button>
                      <button type="button" className="button button-quiet button-small" onClick={() => setEditingTagId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="tag-name">
                        {tag.name}
                        {tag.archived && <span className="badge-draft">Archived</span>}
                      </span>
                      <span className="tag-usage">
                        {tag.usageCount === 0 ? 'unused' : `${tag.usageCount} use${tag.usageCount === 1 ? '' : 's'}`}
                      </span>
                      <span className="tag-actions">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            setEditingTagId(tag.id)
                            setDraftName(tag.name)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            void runAction(() =>
                              api.replaceTag(tag.id, { kind: tag.kind, name: tag.name, archived: !tag.archived }),
                            )
                          }
                        >
                          {tag.archived ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                          type="button"
                          className="link-button link-button-danger"
                          onClick={() => {
                            if (window.confirm(`Delete "${tag.name}"?`)) void runAction(() => api.deleteTag(tag.id))
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="inline-add">
              <input
                type="text"
                value={newNameByKind[tagKind] ?? ''}
                maxLength={60}
                placeholder={`New ${kindLabel.singular.toLowerCase()}`}
                aria-label={`New ${kindLabel.singular.toLowerCase()}`}
                onChange={(event) => setNewNameByKind((previous) => ({ ...previous, [tagKind]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addTag(tagKind)
                  }
                }}
              />
              <button type="button" className="button button-secondary button-small" onClick={() => void addTag(tagKind)}>
                Add
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
