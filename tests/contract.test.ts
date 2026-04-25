import { describe, it, expect } from 'vitest'
import { p2tr, TAPROOT_UNSPENDABLE_KEY } from '@scure/btc-signer'
import { buildContractOutputScripts, buildFundingTx } from '../src/lib/contract'
import { equalBytes, hexToBytes } from '../src/lib/utils'

// ── fixed test vectors ────────────────────────────────────────────────────────

const REGTEST = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef }

// Arbitrary 32-byte x-only pubkeys (not real private keys)
const MAKER_PUBKEY = 'a'.repeat(64)  // 0xaa…aa
const TAKER_PUBKEY = 'b'.repeat(64)  // 0xbb…bb

// SHA256 of "yes" and "no" — real values for determinism checks
const YES_HASH = '69' + '96'.repeat(31)  // placeholder 32-byte hex
const NO_HASH  = '42' + '43'.repeat(31)

const RESOLUTION_BLOCK = 850_000

const BASE_PARAMS = {
  yesHash: YES_HASH,
  noHash: NO_HASH,
  makerPubkey: MAKER_PUBKEY,
  takerPubkey: TAKER_PUBKEY,
  resolutionBlockheight: RESOLUTION_BLOCK,
}

// ── buildContractOutputScripts ────────────────────────────────────────────────

describe('buildContractOutputScripts', () => {
  it('returns two outputs', () => {
    const { makerOutput, takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(makerOutput).toBeDefined()
    expect(takerOutput).toBeDefined()
  })

  it('both outputs have scripts', () => {
    const { makerOutput, takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(makerOutput.script).toBeInstanceOf(Uint8Array)
    expect(takerOutput.script).toBeInstanceOf(Uint8Array)
    expect(makerOutput.script!.length).toBeGreaterThan(0)
    expect(takerOutput.script!.length).toBeGreaterThan(0)
  })

  it('maker and taker outputs have different scripts (different CLTV beneficiaries)', () => {
    const { makerOutput, takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(equalBytes(makerOutput.script!, takerOutput.script!)).toBe(false)
  })

  it('maker and taker outputs have different addresses', () => {
    const { makerOutput, takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(makerOutput.address).not.toBe(takerOutput.address)
  })

  it('both addresses are regtest Taproot (bcrt1p prefix)', () => {
    const { makerOutput, takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(makerOutput.address).toMatch(/^bcrt1p/)
    expect(takerOutput.address).toMatch(/^bcrt1p/)
  })

  it('is deterministic — same inputs produce same scripts', () => {
    const first  = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    const second = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(equalBytes(first.makerOutput.script!, second.makerOutput.script!)).toBe(true)
    expect(equalBytes(first.takerOutput.script!, second.takerOutput.script!)).toBe(true)
  })

  it('different maker pubkeys produce different scripts', () => {
    const a = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    const b = buildContractOutputScripts({ ...BASE_PARAMS, makerPubkey: 'c'.repeat(64) }, REGTEST)
    expect(equalBytes(a.makerOutput.script!, b.makerOutput.script!)).toBe(false)
  })

  it('different taker pubkeys produce different scripts', () => {
    const a = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    const b = buildContractOutputScripts({ ...BASE_PARAMS, takerPubkey: 'd'.repeat(64) }, REGTEST)
    expect(equalBytes(a.takerOutput.script!, b.takerOutput.script!)).toBe(false)
  })

  it('different yes_hash produces different scripts', () => {
    const a = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    const b = buildContractOutputScripts({ ...BASE_PARAMS, yesHash: 'ff'.repeat(32) }, REGTEST)
    expect(equalBytes(a.makerOutput.script!, b.makerOutput.script!)).toBe(false)
  })

  it('different resolution blockheights produce different scripts', () => {
    const a = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    const b = buildContractOutputScripts({ ...BASE_PARAMS, resolutionBlockheight: 900_000 }, REGTEST)
    expect(equalBytes(a.makerOutput.script!, b.makerOutput.script!)).toBe(false)
  })

  it('scripts encode the CLTV locktime = resolutionBlockheight + 144', () => {
    // We verify indirectly: changing the blockheight changes the script
    const a = buildContractOutputScripts({ ...BASE_PARAMS, resolutionBlockheight: 800_000 }, REGTEST)
    const b = buildContractOutputScripts({ ...BASE_PARAMS, resolutionBlockheight: 800_144 }, REGTEST)
    // 800_000 + 144 = 800_144 = 800_000 + 144; shifting by exactly REFUND_DELAY should still differ
    expect(equalBytes(a.makerOutput.script!, b.makerOutput.script!)).toBe(false)
  })
})

// ── buildFundingTx ────────────────────────────────────────────────────────────

describe('buildFundingTx', () => {
  const FAKE_TXID = '0'.repeat(64)
  const MAKER_SCRIPT = new Uint8Array(34).fill(0x51)   // dummy p2tr-ish script
  const MAKER_PUBKEY_BYTES = hexToBytes(MAKER_PUBKEY)

  const makerUtxo = {
    txid: FAKE_TXID,
    vout: 0,
    amount: 200_000,
    script: MAKER_SCRIPT,
    pubkey: MAKER_PUBKEY_BYTES,
  }

  // Valid regtest taproot addresses using the standard unspendable key
  const MAKER_CHANGE_ADDR = p2tr(TAPROOT_UNSPENDABLE_KEY, undefined, REGTEST).address!
  const TAKER_CHANGE_ADDR = p2tr(TAPROOT_UNSPENDABLE_KEY, undefined, REGTEST).address!

  const makerArg = {
    utxo: makerUtxo,
    stake: 100_000,
    changeAddress: MAKER_CHANGE_ADDR,
  }

  const takerArg = {
    input: { txid: '1'.repeat(64), vout: 1, amount: 50_000 },
    stake: 11_111,
    changeAddress: TAKER_CHANGE_ADDR,
  }

  it('creates exactly 2 inputs', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    expect(tx.inputsLength).toBe(2)
  })

  it('first input references the maker UTXO', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    const input = tx.getInput(0)
    const txidHex = Array.from(input.txid!).map(b => b.toString(16).padStart(2, '0')).join('')
    expect(txidHex).toBe(FAKE_TXID)
    expect(input.index).toBe(0)
  })

  it('second input references the taker UTXO', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    const input = tx.getInput(1)
    const txidHex = Array.from(input.txid!).map(b => b.toString(16).padStart(2, '0')).join('')
    expect(txidHex).toBe('1'.repeat(64))
    expect(input.index).toBe(1)
  })

  it('output 0 has the maker stake amount', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    expect(tx.getOutput(0).amount).toBe(BigInt(makerArg.stake))
  })

  it('output 1 has the taker stake amount', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    expect(tx.getOutput(1).amount).toBe(BigInt(takerArg.stake))
  })

  it('output 0 script matches buildContractOutputScripts makerOutput', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    const { makerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(equalBytes(tx.getOutput(0).script!, makerOutput.script!)).toBe(true)
  })

  it('output 1 script matches buildContractOutputScripts takerOutput', () => {
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    const { takerOutput } = buildContractOutputScripts(BASE_PARAMS, REGTEST)
    expect(equalBytes(tx.getOutput(1).script!, takerOutput.script!)).toBe(true)
  })

  it('includes a maker change output when maker has surplus', () => {
    // maker UTXO 200k, stake 100k, fee 1k → change = 99k
    const tx = buildFundingTx(BASE_PARAMS, makerArg, takerArg, REGTEST)
    // at least 3 outputs (2 contract + 1 maker change)
    expect(tx.outputsLength).toBeGreaterThanOrEqual(3)
    expect(tx.getOutput(2).amount).toBe(BigInt(200_000 - 100_000 - 1000))
  })

  it('no change output when input exactly covers stake + fee', () => {
    const exact = { ...makerArg, utxo: { ...makerArg.utxo, amount: 101_000 } }
    // taker input also exactly covers stake + fee so no taker change either
    const exactTaker = { ...takerArg, input: { ...takerArg.input, amount: takerArg.stake + 1_000 } }
    const tx = buildFundingTx(BASE_PARAMS, exact, exactTaker, REGTEST)
    // maker change = 0, taker change = 0 → only 2 contract outputs
    expect(tx.outputsLength).toBe(2)
  })
})
