import { Transaction } from '@scure/btc-signer'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts, REGTEST } from './contract'
import type { ElectrumWS } from './electrum'

const FEE = 1000

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

// Leaf order after taprootWalkTree on [yesLeaf, noLeaf, cltvLeaf]: [no, cltv, yes]
// So tapLeafScript[1] is always the CLTV leaf for our fixed tree structure.
const CLTV_LEAF_IDX = 1

export async function refundFunding(contract: Contract, electrum: ElectrumWS): Promise<string> {
  if (!contract.fundingTxid) throw new Error('contract not funded')
  if (!contract.makerWalletPubkey) throw new Error('missing maker wallet pubkey')
  if (!contract.takerWalletPubkey) throw new Error('missing taker wallet pubkey')

  const isMaker = contract.role === 'maker'
  const walletKeyId = isMaker ? contract.makerWalletKeyId : contract.takerWalletKeyId
  if (!walletKeyId) throw new Error('missing wallet key id')

  const walletKey = await db.wallet.get(walletKeyId)
  if (!walletKey) throw new Error('wallet key not found')

  const { makerOutput, takerOutput } = buildContractOutputScripts({
    yesHash: contract.yesHash,
    noHash: contract.noHash,
    makerPubkey: contract.makerWalletPubkey,
    takerPubkey: contract.takerWalletPubkey,
    resolutionBlockheight: contract.resolutionBlockheight,
  })

  const output = isMaker ? makerOutput : takerOutput
  const stake = isMaker ? contract.makerStake : contract.takerStake
  const outputIdx = isMaker ? 0 : 1
  const locktime = contract.resolutionBlockheight + 144

  const cltvLeaf = output.tapLeafScript![CLTV_LEAF_IDX]

  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime: locktime })
  tx.addInput({
    txid: contract.fundingTxid,
    index: outputIdx,
    witnessUtxo: { script: output.script, amount: BigInt(stake) },
    tapLeafScript: [cltvLeaf],
    sequence: 0xFFFFFFFE,
  })
  tx.addOutputAddress(walletKey.address, BigInt(stake - FEE), REGTEST)

  tx.signIdx(hexToBytes(walletKey.privkey), 0)
  tx.finalize()

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { status: 'refunded', updatedAt: Date.now() })
  return txid
}
