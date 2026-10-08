import { useMemo, useState } from 'react'
import { useSessionData } from '../sessionData'
import { formatDayHeading, formatMinutes, formatTime, formatRating } from '../format'
import { minutesByTrack, sessionTotalMinutes, segmentsOfKind } from '../../shared/metrics'
import { PRACTICE_TRACKS, SEGMENT_TRACK, TRACK_DEFINITIONS, type PracticeTrack } from '../../shared/protocol'
import { TAG_KINDS, type Session } from '../../shared/model'

export function SessionsScreen() {
  const { sessions, tagById, isLoading, loadError } = useSessionData()
  const [searchText, setSearchText] = useState('')
  const [filterTrack, setFilterTrack] = useState<PracticeTrack | null>(null)
  const [showDraftsOnly, setShowDraftsOnly] = useState(false)

  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase()
    return sessions.filter((session) => {
      if (showDraftsOnly && session.status !== 'draft') return false
      if (filterTrack && minutesByTrack(session)[filterTrack] <= 0) return false
      if (!normalizedSearch) return true
      const tagNames = [
        ...session.focusTagIds,
        ...session.winTagIds,
        ...session.watchTagIds,
        ...session.segments.flatMap((segment) => segment.tagIds),
      ]
        .map((tagId) => tagById.get(tagId)?.name.toLocaleLowerCase() ?? '')
        .join(' ')
      const writtenText = [session.slpNote, ...session.segments.map((segment) => segment.notes)].join(' ').toLocaleLowerCase()
      return writtenText.includes(normalizedSearch) || tagNames.includes(normalizedSearch)
    })
  }, [sessions, searchText, filterTrack, showDraftsOnly, tagById])

  const sessionsGroupedByDay = useMemo(() => {
    const groups: { dayKey: string; heading: string; daySessions: Session[] }[] = []
    for (const session of filteredSessions) {
      const occurredAt = new Date(session.occurredAt)
      const dayKey = occurredAt.toDateString()
      const lastGroup = groups.at(-1)
      if (lastGroup?.dayKey === dayKey) lastGroup.daySessions.push(session)
      else groups.push({ dayKey, heading: formatDayHeading(occurredAt), daySessions: [session] })
    }
    return groups
  }, [filteredSessions])

  const draftCount = sessions.filter((session) => session.status === 'draft').length

  if (isLoading) return <p className="screen-message">Opening your practice log...</p>
  if (loadError) return <p className="screen-message form-error">{loadError}</p>

  if (sessions.length === 0) {
    return (
      <div className="screen empty-state">
        <h1>Nothing logged yet</h1>
        <p>Log the warm-up, the glides, and whatever else you did. You can save a draft with just a couple of parts and finish it later.</p>
        <a className="button button-primary" href="#/log">
          Log a session
        </a>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>History</h1>
      </header>

      <div className="filter-bar">
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search notes or tags"
          aria-label="Search sessions"
        />
        <div className="filter-chips">
          {draftCount > 0 && (
            <button type="button" className="chip" aria-pressed={showDraftsOnly} onClick={() => setShowDraftsOnly(!showDraftsOnly)}>
              Drafts ({draftCount})
            </button>
          )}
          {PRACTICE_TRACKS.map((track) => (
            <button
              key={track}
              type="button"
              className="chip"
              aria-pressed={filterTrack === track}
              onClick={() => setFilterTrack(filterTrack === track ? null : track)}
            >
              {TRACK_DEFINITIONS[track].shortLabel}
            </button>
          ))}
        </div>
      </div>

      {sessionsGroupedByDay.length === 0 && <p className="screen-message">Nothing matches. Clear the search or filters.</p>}

      {sessionsGroupedByDay.map((dayGroup) => (
        <section key={dayGroup.dayKey} className="day-group" aria-label={dayGroup.heading}>
          <h2 className="day-heading">{dayGroup.heading}</h2>
          <ul className="session-list">
            {dayGroup.daySessions.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SessionCard({ session }: { session: Session }) {
  const { tagById } = useSessionData()
  const trackMinutes = minutesByTrack(session)
  const totalMinutes = sessionTotalMinutes(session)
  const partLabels = session.segments.map((segment) => SEGMENT_TRACK_LABEL[segment.kind]).join(' - ')
  const watchTagNames = session.watchTagIds.map((tagId) => tagById.get(tagId)?.name ?? 'Watch item')

  return (
    <article className="session-card">
      <a className="session-card-link" href={`#/sessions/${session.id}`}>
        <span className="session-card-time">
          {formatTime(session.occurredAt)}
          {session.status === 'draft' && <span className="badge-draft">Draft</span>}
        </span>
        <span className="session-card-parts">{partLabels || 'No parts recorded'}</span>
        <span className="session-card-minutes">
          {formatMinutes(totalMinutes)} total
          {PRACTICE_TRACKS.filter((track) => trackMinutes[track] > 0).map((track) => (
            <span key={track} className="mini-chip">
              {TRACK_DEFINITIONS[track].shortLabel} {formatMinutes(trackMinutes[track])}
            </span>
          ))}
        </span>
        {session.effortAfter !== null && (
          <span className="effort-line">
            Effort {formatRating(session.effortBefore)} to {formatRating(session.effortAfter)}
          </span>
        )}
      </a>
      {watchTagNames.length > 0 && (
        <div className="session-card-tags">
          {watchTagNames.map((tagName) => (
            <span key={tagName} className="mini-chip mini-chip-watch">
              {tagName}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

const SEGMENT_TRACK_LABEL: Record<string, string> = {
  warmupNote: 'Warm-up',
  glides: 'Glides',
  powerAscending: 'POWER up',
  powerDescending: 'POWER down',
  stretchAndFlow: 'Stretch and Flow',
  endurance: 'Endurance',
}

// Keeps the import of TAG_KINDS meaningful for the filter chips above.
export const SEARCHABLE_TAG_KINDS = TAG_KINDS
