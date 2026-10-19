import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type TagWithUsage } from './api'
import type { ProtocolDocument, ProtocolDocumentId, Recording, Session, Tag } from '../shared/model'

/**
 * The decrypted practice log, held only in React state for the life of the tab.
 * Nothing is written to localStorage, IndexedDB or a service worker cache.
 */
interface SessionData {
  sessions: Session[]
  tags: TagWithUsage[]
  documents: ProtocolDocument[]
  recordings: Recording[]
  tagById: Map<string, Tag>
  documentById: Map<ProtocolDocumentId, ProtocolDocument>
  /** Recordings grouped by the session they belong to, oldest first. */
  recordingsBySessionId: Map<string, Recording[]>
  isLoading: boolean
  loadError: string | null
  refresh: () => Promise<void>
}

const SessionDataContext = createContext<SessionData | null>(null)

export function SessionDataProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [tags, setTags] = useState<TagWithUsage[]>([])
  const [documents, setDocuments] = useState<ProtocolDocument[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [loadedSessions, loadedTags, loadedDocuments, loadedRecordings] = await Promise.all([
        api.listSessions(),
        api.listTags(),
        api.listDocuments(),
        api.listRecordings(),
      ])
      setSessions(loadedSessions)
      setTags(loadedTags)
      setDocuments(loadedDocuments)
      setRecordings(loadedRecordings)
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load the practice log.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const documentById = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const recordingsBySessionId = useMemo(() => {
    const grouped = new Map<string, Recording[]>()
    for (const recording of recordings) {
      const existing = grouped.get(recording.sessionId)
      if (existing) existing.push(recording)
      else grouped.set(recording.sessionId, [recording])
    }
    return grouped
  }, [recordings])

  const value = useMemo(
    () => ({
      sessions,
      tags,
      documents,
      recordings,
      tagById,
      documentById,
      recordingsBySessionId,
      isLoading,
      loadError,
      refresh,
    }),
    [
      sessions,
      tags,
      documents,
      recordings,
      tagById,
      documentById,
      recordingsBySessionId,
      isLoading,
      loadError,
      refresh,
    ],
  )

  return <SessionDataContext.Provider value={value}>{children}</SessionDataContext.Provider>
}

export function useSessionData(): SessionData {
  const sessionData = useContext(SessionDataContext)
  if (!sessionData) throw new Error('useSessionData must be used inside SessionDataProvider')
  return sessionData
}
