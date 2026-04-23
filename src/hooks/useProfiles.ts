import { useEffect, useRef, useState } from 'react'
import { useRelayContext } from '../context/RelayContext'

export type NostrProfile = {
  name?: string
  picture?: string
  about?: string
  banner?: string
  website?: string
}

// Module-level cache shared across all hook instances
const profileCache = new Map<string, NostrProfile>()

/**
 * Fetches Kind 0 metadata for a list of pubkeys and returns a map of
 * pubkey → profile. Results are cached across renders and hook instances.
 */
export function useProfiles(pubkeys: string[]): Map<string, NostrProfile> {
  const { subscribe } = useRelayContext()
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(() => {
    const initial = new Map<string, NostrProfile>()
    for (const pk of pubkeys) {
      if (profileCache.has(pk)) initial.set(pk, profileCache.get(pk)!)
    }
    return initial
  })
  const fetchedRef = useRef(new Set<string>())

  useEffect(() => {
    const missing = pubkeys.filter(pk => !profileCache.has(pk) && !fetchedRef.current.has(pk))
    if (missing.length === 0) return

    for (const pk of missing) fetchedRef.current.add(pk)

    const subId = `profiles:${missing.join(',').slice(0, 64)}`
    const unsub = subscribe(
      subId,
      [{ kinds: [0], authors: missing }],
      (event) => {
        try {
          const parsed: NostrProfile = JSON.parse(event.content)
          profileCache.set(event.pubkey, parsed)
          setProfiles(prev => new Map(prev).set(event.pubkey, parsed))
        } catch {
          // ignore malformed profiles
        }
      },
    )

    return unsub
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkeys.join(',')])

  return profiles
}
