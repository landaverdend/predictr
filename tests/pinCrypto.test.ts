import { describe, it, expect, beforeAll } from 'vitest'
import {
  generateSalt,
  derivePinKey,
  createPinVerifier,
  verifyPin,
  encryptPrivkey,
  decryptPrivkey,
} from '../src/lib/pinCrypto'

// Web Crypto is available in Node 18+ via globalThis.crypto

describe('generateSalt', () => {
  it('returns a 16-byte Uint8Array', () => {
    const salt = generateSalt()
    expect(salt).toBeInstanceOf(Uint8Array)
    expect(salt).toHaveLength(16)
  })

  it('returns different values on each call', () => {
    const a = generateSalt()
    const b = generateSalt()
    expect(a).not.toEqual(b)
  })
})

describe('derivePinKey', () => {
  it('returns a CryptoKey', async () => {
    const salt = generateSalt()
    const key = await derivePinKey('1234', salt)
    expect(key).toBeInstanceOf(CryptoKey)
  })

  it('same PIN + salt produces a key that can decrypt what it encrypted', async () => {
    const salt = generateSalt()
    const key1 = await derivePinKey('1234', salt)
    const key2 = await derivePinKey('1234', salt)
    const cipher = await encryptPrivkey('deadbeef', key1)
    const plain  = await decryptPrivkey(cipher, key2)
    expect(plain).toBe('deadbeef')
  })

  it('different PIN produces a key that cannot decrypt', async () => {
    const salt = generateSalt()
    const key1 = await derivePinKey('1234', salt)
    const key2 = await derivePinKey('9999', salt)
    const cipher = await encryptPrivkey('deadbeef', key1)
    await expect(decryptPrivkey(cipher, key2)).rejects.toThrow()
  })

  it('same PIN with different salt produces different keys', async () => {
    const salt1 = generateSalt()
    const salt2 = generateSalt()
    const key1 = await derivePinKey('1234', salt1)
    const key2 = await derivePinKey('1234', salt2)
    const cipher = await encryptPrivkey('deadbeef', key1)
    await expect(decryptPrivkey(cipher, key2)).rejects.toThrow()
  })
})

describe('encryptPrivkey / decryptPrivkey', () => {
  let key: CryptoKey

  beforeAll(async () => {
    key = await derivePinKey('5678', generateSalt())
  })

  it('round-trips a hex privkey', async () => {
    const original = 'a'.repeat(64)
    const encrypted = await encryptPrivkey(original, key)
    const decrypted = await decryptPrivkey(encrypted, key)
    expect(decrypted).toBe(original)
  })

  it('encrypted output is a non-empty base64 string', async () => {
    const encrypted = await encryptPrivkey('b'.repeat(64), key)
    expect(typeof encrypted).toBe('string')
    expect(encrypted.length).toBeGreaterThan(0)
    // should be valid base64
    expect(() => atob(encrypted)).not.toThrow()
  })

  it('produces different ciphertext on each call (random IV)', async () => {
    const a = await encryptPrivkey('c'.repeat(64), key)
    const b = await encryptPrivkey('c'.repeat(64), key)
    expect(a).not.toBe(b)
  })

  it('round-trips an empty string', async () => {
    const encrypted = await encryptPrivkey('', key)
    const decrypted = await decryptPrivkey(encrypted, key)
    expect(decrypted).toBe('')
  })
})

describe('createPinVerifier / verifyPin', () => {
  it('verifies correctly with the same key', async () => {
    const salt = generateSalt()
    const key = await derivePinKey('4321', salt)
    const verifier = await createPinVerifier(key)
    expect(await verifyPin(verifier, key)).toBe(true)
  })

  it('returns false with a different key (wrong PIN)', async () => {
    const salt = generateSalt()
    const rightKey  = await derivePinKey('correct', salt)
    const wrongKey  = await derivePinKey('wrong',   salt)
    const verifier = await createPinVerifier(rightKey)
    expect(await verifyPin(verifier, wrongKey)).toBe(false)
  })

  it('verifier is a non-empty string', async () => {
    const key = await derivePinKey('0000', generateSalt())
    const verifier = await createPinVerifier(key)
    expect(typeof verifier).toBe('string')
    expect(verifier.length).toBeGreaterThan(0)
  })
})
