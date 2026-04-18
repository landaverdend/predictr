import { Script, p2tr, TAPROOT_UNSPENDABLE_KEY, Transaction } from '@scure/btc-signer'

type Network = { bech32: string; pubKeyHash: number; scriptHash: number; wif: number }

export const REGTEST: Network = { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef }

export type ContractParams = {
  yesHash: string              // 32-byte hex — SHA256(yes_preimage)
  noHash: string               // 32-byte hex — SHA256(no_preimage)
  makerPubkey: string          // 32-byte x-only hex (nostr pubkey)
  takerPubkey: string          // 32-byte x-only hex (nostr pubkey)
  resolutionBlockheight: number


}

function hex(s: string): Uint8Array {
  const arr = new Uint8Array(s.length / 2)
  for (let i = 0; i < s.length; i += 2)
    arr[i / 2] = parseInt(s.slice(i, i + 2), 16)
  return arr
}

function buildContractOutputScripts(p: ContractParams, network: Network = REGTEST) {
  const yh = hex(p.yesHash)
  const nh = hex(p.noHash)
  const mk = hex(p.makerPubkey)
  const tk = hex(p.takerPubkey)
  const locktime = p.resolutionBlockheight + 144

  const yesLeaf = { script: Script.encode(['SHA256', yh, 'EQUALVERIFY', mk, 'CHECKSIG']) }
  const noLeaf = { script: Script.encode(['SHA256', nh, 'EQUALVERIFY', tk, 'CHECKSIG']) }

  // Output 0 (maker_stake): maker refunds via CLTV
  // Output 1 (taker_stake): taker refunds via CLTV
  const makerOutput = p2tr(TAPROOT_UNSPENDABLE_KEY, [yesLeaf, noLeaf, { script: Script.encode([locktime, 'CHECKLOCKTIMEVERIFY', 'DROP', mk, 'CHECKSIG']) }], network, true)
  const takerOutput = p2tr(TAPROOT_UNSPENDABLE_KEY, [yesLeaf, noLeaf, { script: Script.encode([locktime, 'CHECKLOCKTIMEVERIFY', 'DROP', tk, 'CHECKSIG']) }], network, true)

  return { makerOutput, takerOutput }
}


const FEE = 1000 // sats per party

export function buildFundingPsbt(
  contract: ContractParams,
  maker: { utxo: { txid: string; vout: number; amount: number; script: Uint8Array }; stake: number; changeAddress: string },
  taker: { input: { txid: string; vout: number; amount: number }; stake: number; changeAddress: string },
  network: Network = REGTEST,
): string {

  const tx = new Transaction()

  tx.addInput({ txid: maker.utxo.txid, index: maker.utxo.vout, witnessUtxo: { script: maker.utxo.script, amount: BigInt(maker.utxo.amount) } })
  tx.addInput({ txid: taker.input.txid, index: taker.input.vout }) // taker fills in witnessUtxo when signing

  const { makerOutput, takerOutput } = buildContractOutputScripts(contract, network)

  tx.addOutput({ script: makerOutput.script, amount: BigInt(maker.stake) })
  tx.addOutput({ script: takerOutput.script, amount: BigInt(taker.stake) })

  const makerChange = maker.utxo.amount - maker.stake - FEE
  if (makerChange > 0) tx.addOutputAddress(maker.changeAddress, BigInt(makerChange), network)

  const takerChange = taker.input.amount - taker.stake - FEE
  if (takerChange > 0) tx.addOutputAddress(taker.changeAddress, BigInt(takerChange), network)

  const psbt = tx.toPSBT()
  return btoa(String.fromCharCode(...psbt))
}
