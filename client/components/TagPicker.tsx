import { useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { TAG_KIND_LABELS, type TagKind } from '../../shared/model'

interface TagPickerProps {
  kind: TagKind
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}

export function TagPicker({ kind, selectedTagIds, onChange }: TagPickerProps) {
  const { tags, refresh } = useSessionData()
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const kindLabel = TAG_KIND_LABELS[kind]
  // Alphabetical, never reordered by selection: chips that move as you tap are miserable on a phone.
  const availableTags = tags
    .filter((tag) => tag.kind === kind && (!tag.archived || selectedTagIds.includes(tag.id)))
    .sort((left, right) => left.name.localeCompare(right.name))

  const toggleTag = (tagId: string) => {
    onChange(selectedTagIds.includes(tagId) ? selectedTagIds.filter((selectedId) => selectedId !== tagId) : [...selectedTagIds, tagId])
  }

  const addTag = async () => {
    const trimmedName = newName.trim()
    if (!trimmedName) return
    try {
      const createdTag = await api.createTag({ kind, name: trimmedName, archived: false })
      await refresh()
      onChange([...selectedTagIds, createdTag.id])
      setNewName('')
      setIsAdding(false)
      setError(null)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Could not add that tag.')
    }
  }

  return (
    <div className="tag-picker">
      <p className="field-label">{kindLabel.plural}</p>
      {availableTags.length === 0 && !isAdding && <p className="empty-hint">No {kindLabel.plural.toLowerCase()} yet.</p>}
      <div className="chip-row">
        {availableTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="chip"
            aria-pressed={selectedTagIds.includes(tag.id)}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.name}
          </button>
        ))}
        <button type="button" className="chip chip-add" onClick={() => setIsAdding(!isAdding)} aria-expanded={isAdding}>
          + New
        </button>
      </div>
      {isAdding && (
        <div className="inline-add">
          <input
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`New ${kindLabel.singular.toLowerCase()}`}
            aria-label={`New ${kindLabel.singular.toLowerCase()} name`}
            maxLength={60}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void addTag()
              }
            }}
          />
          <button type="button" className="button button-secondary button-small" onClick={() => void addTag()}>
            Add
          </button>
          <button type="button" className="button button-quiet button-small" onClick={() => setIsAdding(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
