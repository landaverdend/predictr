import { Transaction, TaprootControlBlock } from '@scure/btc-signer'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts, REGTEST } from './contract'
import type { ElectrumWS } from './electrum'
import { hexToBytes } from './utils'

const FEE = 2000 // flat fee for 2-input claim tx

// Leaf order after taprootWalkTree on [yesLeaf, noLeaf, cltvLeaf]: [no=0, cltv=1, yes=2]
const YES_LEAF_IDX = 2
const NO_LEAF_IDX = 0

export async function claimFunding(
  contract: Contract,
  electrum: ElectrumWS,
  payoutAddress: string,
): Promise<string> {
  if (contract.status !== 'resolved') throw new Error('contract not resolved')
  if (!contract.outcome) throw new Error('missing outcome')
  if (!contract.winningPreimage) throw new Error('missing winning preimage')
  if (!contract.fundingTxid) throw new Error('contract not funded')
  if (!contract.makerWalletPubkey) throw new Error('missing maker wallet pubkey')
  if (!contract.takerWalletPubkey) throw new Error('missing taker wallet pubkey')

  const isMakerWinner = contract.outcome === 'YES'
  const isOurWin = isMakerWinner ? contract.role === 'maker' : contract.role === 'taker'
  if (!isOurWin) throw new Error('you are not the winner')

  const walletKeyId = isMakerWinner ? contract.makerWalletKeyId : contract.takerWalletKeyId
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

  const leafIdx = isMakerWinner ? YES_LEAF_IDX : NO_LEAF_IDX
  const preimageBytes = hexToBytes(contract.winningPreimage)
  const privkeyBytes = hexToBytes(walletKey.privkey)
  const totalAmount = contract.makerStake + contract.takerStake

  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true })

  // Spend both outputs (winner takes entire pot)
  tx.addInput({
    txid: contract.fundingTxid,
    index: 0,
    witnessUtxo: { script: makerOutput.script, amount: BigInt(contract.makerStake) },
    tapLeafScript: [makerOutput.tapLeafScript![leafIdx]],
  })
  tx.addInput({
    txid: contract.fundingTxid,
    index: 1,
    witnessUtxo: { script: takerOutput.script, amount: BigInt(contract.takerStake) },
    tapLeafScript: [takerOutput.tapLeafScript![leafIdx]],
  })

  tx.addOutputAddress(payoutAddress, BigInt(totalAmount - FEE), REGTEST)

  // Sign both inputs
  tx.signIdx(privkeyBytes, 0)
  tx.signIdx(privkeyBytes, 1)

  // Manually set witness for each input.
  // finalize() doesn't know to push the preimage, so we construct it ourselves.
  // Witness stack: [sig, preimage, script, controlBlock]
  // (sig at bottom for CHECKSIG; preimage at top for SHA256)
  for (let i = 0; i < 2; i++) {
    const output = i === 0 ? makerOutput : takerOutput
    const inp = tx.getInput(i)
    const sig = inp.tapScriptSig![0][1]
    const [cbDecoded, scriptWithVersion] = output.tapLeafScript![leafIdx]
    const script = scriptWithVersion.subarray(0, -1)
    const cb = TaprootControlBlock.encode(cbDecoded)
    tx.updateInput(i, { finalScriptWitness: [sig, preimageBytes, script, cb] }, true)
  }

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { claimTxid: txid, updatedAt: Date.now() })
  return txid
}
