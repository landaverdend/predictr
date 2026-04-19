import type { NostrEvent } from 'nostr-tools'

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>
      nip44?: {
        encrypt(recipientPubkey: string, plaintext: string): Promise<string>
        decrypt(senderPubkey: string, ciphertext: string): Promise<string>
      }
    }
  }
}
