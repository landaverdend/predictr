/**
 * Signer abstraction — wraps either the browser extension (window.nostr)
 * or a NIP-46 bunker connection. Call getNostr() everywhere instead of
 * accessing window.nostr directly.
 */

import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'
import { generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools'

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}
function hexToBytes(h: string): Uint8Array {
  const arr = new Uint8Array(h.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return arr
}

export interface NostrSigner {
  getPublicKey(): Promise<string>
  signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>
  nip44?: {
    encrypt(recipientPubkey: string, plaintext: string): Promise<string>
    decrypt(senderPubkey: string, ciphertext: string): Promise<string>
  }
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>
}

const STORAGE_KEY = 'predictr_bunker'

interface StoredBunker {
  clientSecretKey: string  // hex
  bp: { pubkey: string; relays: string[]; secret: string | null }
}

// Active bunker signer — null means fall back to window.nostr
let _bunker: BunkerSigner | null = null

function wrapBunker(b: BunkerSigner): NostrSigner {
  return {
    getPublicKey: () => b.getPublicKey(),
    signEvent: (e) => b.signEvent(e as Parameters<typeof b.signEvent>[0]) as Promise<NostrEvent>,
    nip44: {
      encrypt: (pub, plain) => b.nip44Encrypt(pub, plain),
      decrypt: (pub, cipher) => b.nip44Decrypt(pub, cipher),
    },
  }
}

/** Returns the active signer: bunker → extension → null */
export function getNostr(): NostrSigner | null {
  if (_bunker) return wrapBunker(_bunker)
  const ext = (window as unknown as { nostr?: NostrSigner }).nostr
  return ext ?? null
}

export type SignerMode = 'extension' | 'bunker' | null

export function getSignerMode(): SignerMode {
  if (_bunker) return 'bunker'
  if ((window as unknown as { nostr?: unknown }).nostr) return 'extension'
  return null
}

/**
 * Connect to a bunker via a bunker:// URI (or NIP-05 address).
 * Stores credentials in localStorage so reconnect() can restore on reload.
 */
export async function connectBunker(uri: string): Promise<void> {
  const bp = await parseBunkerInput(uri)
  if (!bp) throw new Error('could not parse bunker URI')

  // Generate or reuse a client key
  const stored = getStoredBunker()
  const clientSecretKey = stored
    ? hexToBytes(stored.clientSecretKey)
    : generateSecretKey()

  const signer = await BunkerSigner.fromURI(clientSecretKey, uri)
  _bunker = signer

  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    clientSecretKey: bytesToHex(clientSecretKey),
    bp: { pubkey: bp.pubkey, relays: bp.relays, secret: bp.secret },
  } satisfies StoredBunker))
}

/**
 * Reconnect to a previously stored bunker. Call this once at app startup.
 * Silently does nothing if no bunker is stored.
 */
export async function reconnectBunker(): Promise<void> {
  const stored = getStoredBunker()
  if (!stored) return
  try {
    const clientSecretKey = hexToBytes(stored.clientSecretKey)
    const signer = BunkerSigner.fromBunker(clientSecretKey, stored.bp)
    _bunker = signer
  } catch (err) {
    console.warn('bunker reconnect failed, clearing stored config', err)
    disconnectBunker()
  }
}

export function disconnectBunker(): void {
  try { _bunker?.close() } catch {}
  _bunker = null
  localStorage.removeItem(STORAGE_KEY)
}

export function getStoredBunker(): StoredBunker | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Expose the client pubkey for display purposes
export function getBunkerClientPubkey(): string | null {
  const stored = getStoredBunker()
  if (!stored) return null
  try {
    return getPublicKey(hexToBytes(stored.clientSecretKey))
  } catch {
    return null
  }
}
