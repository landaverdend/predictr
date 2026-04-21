import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { HDKey } from '@scure/bip32'
import { p2tr } from '@scure/btc-signer'
import { REGTEST } from './contract'
import type { WalletKey } from '../db'

const DERIVATION_PATH = "m/86'/0'/0'/0"
export const HD_KEY_COUNT = 50

function toHex(b: Uint8Array) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}

export function generateMnemonic(): string {
  return bip39Generate(wordlist, 128) // 12 words
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist)
}

export function deriveKeys(mnemonic: string, count = HD_KEY_COUNT): WalletKey[] {
  const seed = mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)
  const account = root.derive(DERIVATION_PATH)
  const now = Date.now()

  return Array.from({ length: count }, (_, i) => {
    const child = account.deriveChild(i)
    const privkey = child.privateKey!
    const pubkey = child.publicKey!.slice(1) // x-only (strip 0x02/0x03 prefix)
    const { address } = p2tr(pubkey, undefined, REGTEST)
    return {
      id: String(i),
      privkey: toHex(privkey),
      pubkey: toHex(pubkey),
      address: address!,
      createdAt: now,
    }
  })
}
