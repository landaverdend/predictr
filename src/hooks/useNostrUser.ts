import { useEffect, useState } from 'react'
import { useProfiles, type NostrProfile } from './useProfiles'

type NostrUser = {
  pubkey: string
  profile: NostrProfile | undefined
}

export function useNostrUser(): NostrUser | null {
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    if (!window.nostr) return
    window.nostr.getPublicKey().then(pk => setPubkey(pk)).catch(() => {})
  }, [])

  const profiles = useProfiles(pubkey ? [pubkey] : [])

  if (!pubkey) return null
  return { pubkey, profile: profiles.get(pubkey) }
}
