import type { NostrEvent } from 'nostr-tools'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>
    }
  }
}
