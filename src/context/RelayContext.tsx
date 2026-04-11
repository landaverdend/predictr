import { createContext, useContext } from 'react'
import { useRelay, type RelayStatus } from '../hooks/useRelay'
import type { Filter, NostrEvent } from 'nostr-tools'

type RelayContextValue = {
  status: RelayStatus
  subscribe: (id: string, filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void) => () => void
  publish: (event: NostrEvent) => Promise<void>
}

const RelayContext = createContext<RelayContextValue | null>(null)

export function RelayProvider({ url, children }: { url: string; children: React.ReactNode }) {
  const relay = useRelay(url)
  return <RelayContext.Provider value={relay}>{children}</RelayContext.Provider>
}

export function useRelayContext() {
  const ctx = useContext(RelayContext)
  if (!ctx) throw new Error('useRelayContext must be used within RelayProvider')
  return ctx
}
