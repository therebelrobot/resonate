import { useCallback, useEffect, useRef, useState } from 'react'
import { api, LOCKED_EVENT_NAME } from './api'
import { SessionDataProvider, useSessionData } from './sessionData'
import { navigateTo, useRoute } from './router'
import { SetupScreen, UnlockScreen } from './screens/AccessScreens'
import { TodayScreen } from './screens/TodayScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { SessionDetailScreen } from './screens/SessionDetailScreen'
import { SessionEditor } from './screens/SessionEditor'
import { InsightsScreen } from './screens/InsightsScreen'
import { ReportScreen } from './screens/ReportScreen'
import { ProtocolScreen } from './screens/ProtocolScreen'
import { TagsScreen } from './screens/TagsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import type { VaultStatus } from '../shared/model'

export function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.getStatus())
      setStatusError(null)
    } catch {
      setStatusError('Cannot reach the server. Check that it is running, then reload.')
    }
  }, [])

  useEffect(() => {
    void loadStatus()
    const handleLocked = () => setStatus((previous) => (previous ? { ...previous, unlocked: false } : previous))
    window.addEventListener(LOCKED_EVENT_NAME, handleLocked)
    return () => window.removeEventListener(LOCKED_EVENT_NAME, handleLocked)
  }, [loadStatus])

  if (statusError) {
    return (
      <main className="access-screen">
        <p className="form-error">{statusError}</p>
      </main>
    )
  }
  if (!status) return <main className="access-screen" aria-busy="true" />
  if (!status.vaultInitialized) return <SetupScreen onReady={() => void loadStatus()} />
  if (!status.unlocked) return <UnlockScreen totpEnabled={status.totpEnabled} onUnlocked={() => void loadStatus()} />

  const lockNow = async () => {
    await api.lock().catch(() => undefined)
    setStatus({ ...status, unlocked: false })
  }

  return (
    // Unmounting this provider on lock drops every decrypted session from memory.
    <SessionDataProvider>
      <UnlockedShell status={status} onStatusChange={() => void loadStatus()} onLock={() => void lockNow()} />
    </SessionDataProvider>
  )
}

function UnlockedShell({
  status,
  onStatusChange,
  onLock,
}: {
  status: VaultStatus
  onStatusChange: () => void
  onLock: () => void
}) {
  const route = useRoute()
  const { sessions, isLoading } = useSessionData()
  const [isObscured, setIsObscured] = useState(false)

  // Held in a ref so re-renders don't restart the idle clock.
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  // Lock locally on idle too, so an open tab doesn't keep showing sessions after the server session ends.
  useEffect(() => {
    let lastActivityMilliseconds = Date.now()
    const markActivity = () => {
      lastActivityMilliseconds = Date.now()
    }
    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))
    const idleCheckTimer = window.setInterval(() => {
      if (Date.now() - lastActivityMilliseconds > status.sessionIdleMinutes * 60_000) onLockRef.current()
    }, 15_000)
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity))
      window.clearInterval(idleCheckTimer)
    }
  }, [status.sessionIdleMinutes])

  // Blur content while the app is in the background, so app-switcher snapshots don't show sessions.
  useEffect(() => {
    const handleVisibility = () => setIsObscured(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const isEditing = route.screen === 'new-session' || route.screen === 'edit-session'
  const routedSession =
    route.screen === 'session' || route.screen === 'edit-session'
      ? sessions.find((session) => session.id === route.sessionId)
      : undefined

  let screenContent
  if (route.screen === 'new-session') screenContent = <SessionEditor key="new" />
  else if ((route.screen === 'session' || route.screen === 'edit-session') && !routedSession) {
    screenContent = isLoading ? (
      <p className="screen-message">Opening your practice log...</p>
    ) : (
      <div className="screen empty-state">
        <h1>Session not found</h1>
        <p>It may have been deleted on another device.</p>
        <a className="button button-secondary" href="#/sessions">
          Back to history
        </a>
      </div>
    )
  } else if (route.screen === 'edit-session') {
    screenContent = <SessionEditor key={routedSession!.id} existingSession={routedSession} />
  } else if (route.screen === 'session') screenContent = <SessionDetailScreen session={routedSession!} />
  else if (route.screen === 'sessions') screenContent = <SessionsScreen />
  else if (route.screen === 'insights') screenContent = <InsightsScreen />
  else if (route.screen === 'report') screenContent = <ReportScreen />
  else if (route.screen === 'protocol') screenContent = <ProtocolScreen />
  else if (route.screen === 'tags') screenContent = <TagsScreen />
  else if (route.screen === 'settings') {
    screenContent = <SettingsScreen status={status} onStatusChange={onStatusChange} onLock={onLock} />
  } else screenContent = <TodayScreen />

  const activeTab =
    route.screen === 'sessions' || route.screen === 'session'
      ? 'sessions'
      : route.screen === 'insights' || route.screen === 'report'
        ? 'insights'
        : route.screen === 'settings' || route.screen === 'tags' || route.screen === 'protocol'
          ? 'settings'
          : 'today'

  return (
    <div className={`app-shell${isEditing ? ' is-editing' : ''}${isObscured ? ' is-obscured' : ''}`}>
      {!isEditing && (
        <nav className="app-nav" aria-label="Main">
          <a className="app-nav-brand" href="#/today">
            Resonate
          </a>
          <a className="app-nav-link" href="#/today" aria-current={activeTab === 'today' ? 'page' : undefined}>
            <NavIcon name="today" />
            <span>Today</span>
          </a>
          <a className="app-nav-link" href="#/sessions" aria-current={activeTab === 'sessions' ? 'page' : undefined}>
            <NavIcon name="sessions" />
            <span>History</span>
          </a>
          <button type="button" className="app-nav-log" onClick={() => navigateTo('/log')}>
            <NavIcon name="log" />
            <span>Log</span>
          </button>
          <a className="app-nav-link" href="#/insights" aria-current={activeTab === 'insights' ? 'page' : undefined}>
            <NavIcon name="insights" />
            <span>Insights</span>
          </a>
          <a className="app-nav-link" href="#/settings" aria-current={activeTab === 'settings' ? 'page' : undefined}>
            <NavIcon name="settings" />
            <span>Settings</span>
          </a>
        </nav>
      )}
      <main className="app-main">{screenContent}</main>
    </div>
  )
}

function NavIcon({ name }: { name: 'today' | 'sessions' | 'log' | 'insights' | 'settings' }) {
  const paths: Record<'today' | 'sessions' | 'log' | 'insights' | 'settings', string> = {
    today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
    sessions: 'M5 6h14M5 12h14M5 18h9',
    log: 'M12 5v14M5 12h14',
    insights: 'M4 18l5-6 4 3 7-9',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
