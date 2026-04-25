import type { WalletKey } from '../db'

const PBKDF2_ITERATIONS = 200_000
const PIN_CHECK_PLAINTEXT = 'nostr-dlc-pin-ok'

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

export async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Packs iv (12 bytes) + ciphertext into a single base64 blob.
async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(12 + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), 12)
  return btoa(String.fromCharCode(...combined))
}

async function decryptString(blob: string, key: CryptoKey): Promise<string> {
  const bytes = Uint8Array.from(atob(blob), c => c.charCodeAt(0))
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  )
  return new TextDecoder().decode(plaintext)
}

// Verifier — encrypt a known string; on unlock, decrypt and compare.
export async function createPinVerifier(key: CryptoKey): Promise<string> {
  return encryptString(PIN_CHECK_PLAINTEXT, key)
}

export async function verifyPin(verifier: string, key: CryptoKey): Promise<boolean> {
  try {
    return await decryptString(verifier, key) === PIN_CHECK_PLAINTEXT
  } catch {
    return false
  }
}

export async function encryptPrivkey(privkeyHex: string, key: CryptoKey): Promise<string> {
  return encryptString(privkeyHex, key)
}

export async function decryptPrivkey(blob: string, key: CryptoKey): Promise<string> {
  return decryptString(blob, key)
}

// ── Session key (in-memory only, cleared on page refresh) ─────────────────────

let _sessionKey: CryptoKey | null = null

export function setSessionKey(k: CryptoKey): void { _sessionKey = k }
export function getSessionKey(): CryptoKey | null { return _sessionKey }
export function clearSessionKey(): void { _sessionKey = null }
export function isWalletUnlocked(): boolean { return _sessionKey !== null }

/** Returns true if a privkey blob is stored as plain (unencrypted) hex. */
export function isUnencryptedPrivkey(privkey: string): boolean {
  return /^[0-9a-f]{64}$/i.test(privkey)
}

/** Decrypt a wallet key's privkey using the current session. Throws if locked.
 *
 * If the stored privkey is still plain hex (64 hex chars) — which happens when
 * wallet keys are regenerated after a network switch before re-encryption runs —
 * the raw key is returned directly. It is already unprotected at rest in that
 * state, so returning it doesn't weaken security further.
 */
export async function getDecryptedPrivkey(walletKey: WalletKey): Promise<string> {
  if (/^[0-9a-f]{64}$/i.test(walletKey.privkey)) {
    return walletKey.privkey
  }
  if (!_sessionKey) throw new Error('wallet locked — enter PIN first')
  return decryptPrivkey(walletKey.privkey, _sessionKey)
}
