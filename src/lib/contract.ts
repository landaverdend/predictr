import { Script, p2tr, TAPROOT_UNSPENDABLE_KEY, Transaction, SigHash } from '@scure/btc-signer'
import { hexToBytes, REFUND_DELAY } from './utils'
import { BITCOIN_NETWORK } from './config'

type Network = { bech32: string; pubKeyHash: number; scriptHash: number; wif: number }

// Re-export for callers that imported REGTEST directly
export const REGTEST = BITCOIN_NETWORK

export type ContractParams = {
  yesHash: string              // 32-byte hex — SHA256(yes_preimage)
  noHash: string               // 32-byte hex — SHA256(no_preimage)
  makerPubkey: string          // 32-byte x-only hex — wallet pubkey, used in DLC script leaves
  takerPubkey: string          // 32-byte x-only hex — wallet pubkey, used in DLC script leaves
  resolutionBlockheight: number
}

export function buildContractOutputScripts(p: ContractParams, network: Network = REGTEST) {
  const yh = hexToBytes(p.yesHash)
  const nh = hexToBytes(p.noHash)
  const mk = hexToBytes(p.makerPubkey)
  const tk = hexToBytes(p.takerPubkey)
  const locktime = p.resolutionBlockheight + REFUND_DELAY

  const yesLeaf = { script: Script.encode(['SHA256', yh, 'EQUALVERIFY', mk, 'CHECKSIG']) }
  const noLeaf = { script: Script.encode(['SHA256', nh, 'EQUALVERIFY', tk, 'CHECKSIG']) }

  // Output 0 (maker_stake): maker refunds via CLTV
  // Output 1 (taker_stake): taker refunds via CLTV
  const makerOutput = p2tr(TAPROOT_UNSPENDABLE_KEY, [yesLeaf, noLeaf, { script: Script.encode([locktime, 'CHECKLOCKTIMEVERIFY', 'DROP', mk, 'CHECKSIG']) }], network, true)
  const takerOutput = p2tr(TAPROOT_UNSPENDABLE_KEY, [yesLeaf, noLeaf, { script: Script.encode([locktime, 'CHECKLOCKTIMEVERIFY', 'DROP', tk, 'CHECKSIG']) }], network, true)

  return { makerOutput, takerOutput }
}


const FEE = 1000 // sats per party

export function buildFundingTx(
  contract: ContractParams,
  maker: { utxo: { txid: string; vout: number; amount: number; script: Uint8Array; pubkey: Uint8Array }; stake: number; changeAddress: string },
  taker: { input: { txid: string; vout: number; amount: number }; stake: number; changeAddress: string },
  network: Network = REGTEST,
): Transaction {
  const tx = new Transaction({ allowUnknownOutputs: true })

  tx.addInput({ txid: maker.utxo.txid, index: maker.utxo.vout, witnessUtxo: { script: maker.utxo.script, amount: BigInt(maker.utxo.amount) }, tapInternalKey: maker.utxo.pubkey, sighashType: SigHash.ALL_ANYONECANPAY })
  // placeholder witnessUtxo — taker must replace script with their real scriptPubKey before signing.
  // the dummy script doesn't affect the maker's ANYONECANPAY signature since only the maker's
  // own input is committed to. the library requires witnessUtxo on all inputs before signing any.
  // placeholder — taker replaces with their real scriptPubKey before signing.
  // ANYONECANPAY means the maker's sig doesn't commit to this; library just needs
  // witnessUtxo present on all inputs before it will sign any of them.
  const dummyScript = new Uint8Array([0x51, 0x20, ...TAPROOT_UNSPENDABLE_KEY])
  tx.addInput({ txid: taker.input.txid, index: taker.input.vout, witnessUtxo: { script: dummyScript, amount: BigInt(taker.input.amount) } })

  const { makerOutput, takerOutput } = buildContractOutputScripts(contract, network)

  tx.addOutput({ script: makerOutput.script, amount: BigInt(maker.stake) })
  tx.addOutput({ script: takerOutput.script, amount: BigInt(taker.stake) })

  const makerChange = maker.utxo.amount - maker.stake - FEE
  if (makerChange > 0) tx.addOutputAddress(maker.changeAddress, BigInt(makerChange), network)

  const takerChange = taker.input.amount - taker.stake - FEE
  if (takerChange > 0) tx.addOutputAddress(taker.changeAddress, BigInt(takerChange), network)

  return tx
}
