import { describe, it, expect } from 'vitest'
import { hexToBytes, equalBytes, REFUND_DELAY } from '../src/lib/utils'

describe('hexToBytes', () => {
  it('converts a known hex string to bytes', () => {
    expect(hexToBytes('deadbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
  })

  it('handles an empty string', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array([]))
  })

  it('produces 32 bytes from a 64-char hex string', () => {
    const hex = 'a'.repeat(64)
    expect(hexToBytes(hex)).toHaveLength(32)
  })

  it('is consistent with Buffer.from for known values', () => {
    const hex = '0102030405060708090a0b0c0d0e0f10'
    const result = hexToBytes(hex)
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(i + 1)
    }
  })
})

describe('equalBytes', () => {
  it('returns true for identical arrays', () => {
    const a = new Uint8Array([1, 2, 3])
    expect(equalBytes(a, new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('returns false for arrays that differ in content', () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
  })

  it('returns false for arrays of different lengths', () => {
    expect(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })

  it('returns true for two empty arrays', () => {
    expect(equalBytes(new Uint8Array([]), new Uint8Array([]))).toBe(true)
  })
})

describe('REFUND_DELAY', () => {
  it('is 144 blocks (~1 day)', () => {
    expect(REFUND_DELAY).toBe(144)
  })
})
