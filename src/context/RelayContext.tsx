import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Filter, NostrEvent } from 'nostr-tools'
import { pool } from '../lib/pool'
import { db } from '../db'

// ── types ─────────────────────────────────────────────────────────────────────

export type RelayStatus = 'connecting' | 'connected' | 'disconnected'

type SubParams = {
  filters: Filter[]
  onEvent: (e: NostrEvent) => void
  onEose?: () => void
}

type RelayContextValue = {
  status: RelayStatus
  relays: string[]
  saveRelays: (urls: string[]) => Promise<void>
  subscribe: (id: string, filters: Filter[], onEvent: (e: NostrEvent) => void, onEose?: () => void) => () => void
  publish: (event: NostrEvent) => Promise<void>
}

// ── constants ─────────────────────────────────────────────────────────────────

const RELAYS_KEY = 'relays'
const DEFAULT_RELAYS = ['ws://kratomstr.io:7777']

// ── helpers ───────────────────────────────────────────────────────────────────

function openSubs(relays: string[], params: SubParams): { close(): void }[] {
  return params.filters.map(filter =>
    pool.subscribeMany(relays, filter, {
      onevent: params.onEvent,
      oneose: params.onEose,
    })
  )
}

function closeSubs(subs: { close(): void }[]) {
  subs.forEach(s => s.close())
}

async function loadRelays(): Promise<string[]> {
  const saved = await db.settings.get(RELAYS_KEY)
  if (saved && Array.isArray(saved.value)) {
    // Filter out any malformed URLs that snuck in (e.g. missing port)
    const valid = (saved.value as string[]).filter(url => {
      try { return Boolean(new URL(url).hostname) } catch { return false }
    })
    if (valid.length !== (saved.value as string[]).length) {
      await db.settings.put({ key: RELAYS_KEY, value: valid })
    }
    return valid
  }
  return DEFAULT_RELAYS
}

async function saveRelays(relays: string[]): Promise<void> {
  await db.settings.put({ key: RELAYS_KEY, value: relays })
}

// ── context ───────────────────────────────────────────────────────────────────

const RelayContext = createContext<RelayContextValue | null>(null)

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const [relays, setRelaysState] = useState<string[]>([])
  const [status, setStatus] = useState<RelayStatus>('connecting')

  const relaysRef = useRef<string[]>([])
  relaysRef.current = relays

  // id → array of SubClosers (one per filter)
  const activeSubs = useRef(new Map<string, { close(): void }[]>())
  // registered sub params for re-subscribing on relay change
  const registeredSubs = useRef(new Map<string, SubParams>())

  // ── initial relay load ───────────────────────────────────────────────────

  useEffect(() => {
    loadRelays().then(urls => {
      setRelaysState(urls)
      setStatus(urls.length > 0 ? 'connected' : 'disconnected')
    })
  }, [])

  // ── NIP-65 Kind 10002 seeding ────────────────────────────────────────────

  useEffect(() => {
    if (relays.length === 0 || !window.nostr) return
    let cancelled = false

    window.nostr.getPublicKey().then(pubkey => {
      if (cancelled) return
      const sub = pool.subscribeMany(
        relays,
        { kinds: [10002], authors: [pubkey], limit: 1 },
        {
          onevent(event) {
            const discovered = event.tags
              .filter(t => t[0] === 'r')
              .map(t => t[1])
              .filter(url => {
                try { return Boolean(new URL(url).hostname) } catch { return false }
              })
            if (discovered.length === 0) return
            setRelaysState(prev => {
              const merged = [...new Set([...prev, ...discovered])]
              if (merged.length === prev.length) return prev
              saveRelays(merged)
              return merged
            })
          },
        }
      )
      setTimeout(() => sub.close(), 10_000)
    }).catch(() => {})

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays.length > 0])

  // ── re-subscribe all when relay list changes ─────────────────────────────

  useEffect(() => {
    if (relays.length === 0) return
    for (const [id, params] of registeredSubs.current) {
      closeSubs(activeSubs.current.get(id) ?? [])
      activeSubs.current.set(id, openSubs(relays, params))
    }
  }, [relays])

  // ── subscribe ────────────────────────────────────────────────────────────

  const subscribe = useCallback((
    id: string,
    filters: Filter[],
    onEvent: (e: NostrEvent) => void,
    onEose?: () => void,
  ): (() => void) => {
    const params: SubParams = { filters, onEvent, onEose }
    registeredSubs.current.set(id, params)

    if (relaysRef.current.length > 0) {
      closeSubs(activeSubs.current.get(id) ?? [])
      activeSubs.current.set(id, openSubs(relaysRef.current, params))
    }

    return () => {
      closeSubs(activeSubs.current.get(id) ?? [])
      activeSubs.current.delete(id)
      registeredSubs.current.delete(id)
    }
  }, [])

  // ── publish ──────────────────────────────────────────────────────────────

  const publish = useCallback(async (event: NostrEvent): Promise<void> => {
    if (relaysRef.current.length === 0) throw new Error('no relays configured')
    const results = await Promise.allSettled(
      pool.publish(relaysRef.current, event, { maxWait: 8000 })
    )
    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length === results.length) {
      const reason = (failures[0] as PromiseRejectedResult).reason
      throw new Error(`publish failed on all relays: ${reason}`)
    }
  }, [])

  // ── relay management ─────────────────────────────────────────────────────

  const saveRelaysFn = useCallback(async (urls: string[]): Promise<void> => {
    await saveRelays(urls)
    setRelaysState(urls)
    setStatus(urls.length > 0 ? 'connected' : 'disconnected')
  }, [])

  return (
    <RelayContext.Provider value={{ status, relays, saveRelays: saveRelaysFn, subscribe, publish }}>
      {children}
    </RelayContext.Provider>
  )
}

export function useRelayContext() {
  const ctx = useContext(RelayContext)
  if (!ctx) throw new Error('useRelayContext must be used within RelayProvider')
  return ctx
}
