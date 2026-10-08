import { useEffect, useState } from 'react'

/** Hash routes: no server routing needed, and nothing sensitive ever lands in a URL path. */
export type Route =
  | { screen: 'today' }
  | { screen: 'sessions' }
  | { screen: 'new-session' }
  | { screen: 'session'; sessionId: string }
  | { screen: 'edit-session'; sessionId: string }
  | { screen: 'insights' }
  | { screen: 'report' }
  | { screen: 'protocol' }
  | { screen: 'tags' }
  | { screen: 'settings' }

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [first, second, third] = segments
  if (first === 'log') return { screen: 'new-session' }
  if (first === 'sessions' && second && third === 'edit') return { screen: 'edit-session', sessionId: second }
  if (first === 'sessions' && second) return { screen: 'session', sessionId: second }
  if (first === 'sessions') return { screen: 'sessions' }
  if (first === 'insights') return { screen: 'insights' }
  if (first === 'report') return { screen: 'report' }
  if (first === 'protocol') return { screen: 'protocol' }
  if (first === 'tags') return { screen: 'tags' }
  if (first === 'settings') return { screen: 'settings' }
  return { screen: 'today' }
}

export function navigateTo(hashPath: string, options: { replace?: boolean } = {}): void {
  const targetHash = `#${hashPath}`
  if (options.replace) {
    history.replaceState(null, '', targetHash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = targetHash
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  return route
}
