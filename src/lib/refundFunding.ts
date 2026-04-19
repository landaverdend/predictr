import { Transaction } from '@scure/btc-signer'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts, REGTEST } from './contract'
import type { ElectrumWS } from './electrum'
import { hexToBytes, REFUND_DELAY } from './utils'

const FEE = 1000

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
  const locktime = contract.resolutionBlockheight + REFUND_DELAY

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
