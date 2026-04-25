import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock Dexie and the db so spend.ts can be imported in Node
vi.mock('../src/db', () => ({ db: {} }))
// Mock pinCrypto session key (not testing encryption here)
vi.mock('../src/lib/pinCrypto', () => ({
  getDecryptedPrivkey: vi.fn(),
  getSessionKey: vi.fn(() => null),
  setSessionKey: vi.fn(),
  isWalletUnlocked: vi.fn(() => false),
  generateSalt: vi.fn(),
  derivePinKey: vi.fn(),
  createPinVerifier: vi.fn(),
  verifyPin: vi.fn(),
  encryptPrivkey: vi.fn(),
  decryptPrivkey: vi.fn(),
}))

import { validateFundingPsbt } from '../src/lib/spend'
import { buildContractOutputScripts, buildFundingTx } from '../src/lib/contract'
import { Transaction } from '@scure/btc-signer'
import { hexToBytes } from '../src/lib/utils'
import type { Contract } from '../src/db'

// ── helpers ───────────────────────────────────────────────────────────────────

const REGTEST = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef }

const MAKER_PUBKEY = 'aa'.repeat(32)
const TAKER_PUBKEY = 'bb'.repeat(32)
const YES_HASH     = 'cc'.repeat(32)
const NO_HASH      = 'dd'.repeat(32)
const MAKER_TXID   = '0'.repeat(64)
const TAKER_TXID   = '1'.repeat(64)
const RESOLUTION   = 850_000
const MAKER_STAKE  = 100_000
const TAKER_STAKE  = 11_111

const CONTRACT_PARAMS = {
  yesHash: YES_HASH,
  noHash: NO_HASH,
  makerPubkey: MAKER_PUBKEY,
  takerPubkey: TAKER_PUBKEY,
  resolutionBlockheight: RESOLUTION,
}

/** Build a valid funding tx and serialise it to base64 PSBT. */
function buildValidPsbt(): string {
  const { makerOutput } = buildContractOutputScripts(CONTRACT_PARAMS, REGTEST)
  const tx = buildFundingTx(
    CONTRACT_PARAMS,
    {
      utxo: {
        txid: MAKER_TXID,
        vout: 0,
        amount: MAKER_STAKE + 1000,
        script: makerOutput.script!,
        pubkey: hexToBytes(MAKER_PUBKEY),
      },
      stake: MAKER_STAKE,
      changeAddress: 'bcrt1p' + 'q'.repeat(58),
    },
    {
      input: { txid: TAKER_TXID, vout: 1, amount: TAKER_STAKE + 1000 },
      stake: TAKER_STAKE,
      changeAddress: 'bcrt1p' + 'r'.repeat(58),
    },
    REGTEST,
  )
  return btoa(String.fromCharCode(...tx.toPSBT()))
}

/** Minimal Contract object for validateFundingPsbt. */
function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'test-contract',
    role: 'taker',
    status: 'awaiting_psbt',
    side: 'YES',
    marketId: 'market-1',
    marketQuestion: 'Test?',
    oraclePubkey: 'ee'.repeat(32),
    announcementEventId: 'ff'.repeat(32),
    yesHash: YES_HASH,
    noHash: NO_HASH,
    resolutionBlockheight: RESOLUTION,
    counterpartyPubkey: 'ee'.repeat(32),
    makerStake: MAKER_STAKE,
    confidence: 90,
    takerStake: TAKER_STAKE,
    makerWalletPubkey: MAKER_PUBKEY,
    takerWalletPubkey: TAKER_PUBKEY,
    takerInput: { txid: TAKER_TXID, vout: 1, amount: TAKER_STAKE + 1000 },
    unread: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Contract
}

// ── validateFundingPsbt ───────────────────────────────────────────────────────

describe('validateFundingPsbt', () => {
  let validPsbtBase64: string
  let validTx: Transaction

  beforeAll(() => {
    validPsbtBase64 = buildValidPsbt()
    const bytes = Uint8Array.from(atob(validPsbtBase64), c => c.charCodeAt(0))
    validTx = Transaction.fromPSBT(bytes, { allowUnknownOutputs: true })
  })

  it('passes for a correctly constructed PSBT', () => {
    expect(() => validateFundingPsbt(validTx, makeContract())).not.toThrow()
  })

  it('throws when makerWalletPubkey is missing', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ makerWalletPubkey: undefined }))
    ).toThrow('missing maker wallet pubkey')
  })

  it('throws when takerWalletPubkey is missing', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerWalletPubkey: undefined }))
    ).toThrow('missing taker wallet pubkey')
  })

  it('throws when takerInput is missing', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerInput: undefined }))
    ).toThrow('missing taker input')
  })

  it('throws when taker input UTXO does not match contract', () => {
    // Contract says taker's UTXO is at TAKER_TXID:1, but claim a different txid
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerInput: { txid: '2'.repeat(64), vout: 1, amount: TAKER_STAKE + 1000 } }))
    ).toThrow('taker input does not match')
  })

  it('throws when taker input vout does not match', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerInput: { txid: TAKER_TXID, vout: 99, amount: TAKER_STAKE + 1000 } }))
    ).toThrow('taker input does not match')
  })

  it('throws when output 0 script does not match (wrong maker pubkey)', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ makerWalletPubkey: 'ee'.repeat(32) }))
    ).toThrow('output 0 script does not match')
  })

  it('throws when output script does not match (wrong taker pubkey)', () => {
    // noLeaf uses taker pubkey and is shared by both outputs, so output 0 fails first
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerWalletPubkey: 'ee'.repeat(32) }))
    ).toThrow('output 0 script does not match')
  })

  it('throws when makerStake amount does not match output 0', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ makerStake: MAKER_STAKE + 1 }))
    ).toThrow('output 0 amount')
  })

  it('throws when takerStake amount does not match output 1', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerStake: TAKER_STAKE + 1 }))
    ).toThrow('output 1 amount')
  })

  it('throws when yes_hash is wrong (script mismatch)', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ yesHash: 'ff'.repeat(32) }))
    ).toThrow('script does not match')
  })

  it('throws when no_hash is wrong (script mismatch)', () => {
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ noHash: '00'.repeat(32) }))
    ).toThrow('script does not match')
  })

  it('throws when taker would be drained beyond stake + fee', () => {
    // Claim taker's UTXO has 100,000 sats but the PSBT returns no change →
    // takerSpend = 100,000 − 0 = 100,000, which exceeds takerStake(11,111) + 2,000
    expect(() =>
      validateFundingPsbt(validTx, makeContract({ takerInput: { txid: TAKER_TXID, vout: 1, amount: 100_000 } }))
    ).toThrow('taker would spend')
  })
})
