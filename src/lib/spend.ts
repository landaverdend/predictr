import { Transaction, Address, OutScript, TaprootControlBlock } from '@scure/btc-signer'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts, REGTEST, FEE_PER_PARTY } from './contract'
import type { ElectrumClient as ElectrumWS } from './electrumClient'
import { hexToBytes, equalBytes, REFUND_DELAY } from './utils'
import type { WalletUTXO } from '../hooks/useWallet'
import { getDecryptedPrivkey } from './pinCrypto'
import { refundFee, claimFee, sendFee } from './feeEstimator'

// Leaf order after taprootWalkTree on [yesLeaf, noLeaf, cltvLeaf]: [no=0, cltv=1, yes=2]
const YES_LEAF_IDX = 2
const CLTV_LEAF_IDX = 1
const NO_LEAF_IDX = 0

// ── PSBT validation (taker) ───────────────────────────────────────────────────

// Rebuilds the expected contract scripts from known parameters and verifies
// the PSBT outputs match exactly — prevents the maker from substituting a
// script they fully control.
export function validateFundingPsbt(tx: Transaction, contract: Contract): void {
  if (!contract.makerWalletPubkey) throw new Error('missing maker wallet pubkey')
  if (!contract.takerWalletPubkey) throw new Error('missing taker wallet pubkey')
  if (!contract.takerInput) throw new Error('missing taker input')

  // Must have at least 2 inputs (maker + taker) and 2 outputs (contract outputs)
  if (tx.inputsLength < 2) throw new Error('PSBT has fewer than 2 inputs')
  if (tx.outputsLength < 2) throw new Error('PSBT has fewer than 2 outputs')

  // Verify taker's input references the expected UTXO
  const takerIn = tx.getInput(1)
  if (takerIn.txid === undefined || takerIn.index === undefined)
    throw new Error('taker input missing txid/index')
  const takerTxid = Array.from(takerIn.txid).map(b => b.toString(16).padStart(2, '0')).join('')
  if (takerTxid !== contract.takerInput.txid || takerIn.index !== contract.takerInput.vout)
    throw new Error('taker input does not match expected UTXO')

  // Rebuild expected scripts and compare byte-for-byte
  const { makerOutput, takerOutput } = buildContractOutputScripts({
    yesHash: contract.yesHash,
    noHash: contract.noHash,
    makerPubkey: contract.makerWalletPubkey,
    takerPubkey: contract.takerWalletPubkey,
    resolutionBlockheight: contract.resolutionBlockheight,
  })

  const out0 = tx.getOutput(0)
  const out1 = tx.getOutput(1)

  if (!out0.script || !equalBytes(out0.script, makerOutput.script))
    throw new Error('output 0 script does not match expected maker contract script')
  if (!out1.script || !equalBytes(out1.script, takerOutput.script))
    throw new Error('output 1 script does not match expected taker contract script')

  if (out0.amount !== BigInt(contract.makerStake))
    throw new Error(`output 0 amount ${out0.amount} does not match maker stake ${contract.makerStake}`)
  if (out1.amount !== BigInt(contract.takerStake))
    throw new Error(`output 1 amount ${out1.amount} does not match taker stake ${contract.takerStake}`)

  // Ensure taker isn't being drained beyond stake + reasonable fee
  const takerUtxoAmount = BigInt(contract.takerInput.amount)
  const takerChange = Array.from({ length: tx.outputsLength }, (_, i) => tx.getOutput(i))
    .slice(2)
    .reduce((sum, o) => sum + (o.amount ?? 0n), 0n)
  const takerSpend = takerUtxoAmount - takerChange
  const maxAllowed = BigInt(contract.takerStake) + BigInt(FEE_PER_PARTY) // stake + max fee
  if (takerSpend > maxAllowed)
    throw new Error(`taker would spend ${takerSpend} sats but agreed to stake ${contract.takerStake} + fee`)
}

// ── sign & broadcast (taker) ──────────────────────────────────────────────────

export async function signAndBroadcastFunding(
  contract: Contract,
  electrum: ElectrumWS,
): Promise<string> {
  if (!contract.fundingPsbt) throw new Error('no funding PSBT on contract')
  if (!contract.takerInput) throw new Error('missing taker input')
  if (!contract.takerWalletKeyId) throw new Error('missing wallet key reference')

  const walletKey = await db.wallet.get(contract.takerWalletKeyId)
  if (!walletKey) throw new Error('wallet key not found — was it deleted?')

  const psbtBytes = Uint8Array.from(atob(contract.fundingPsbt), c => c.charCodeAt(0))
  const tx = Transaction.fromPSBT(psbtBytes, { allowUnknownOutputs: true })

  validateFundingPsbt(tx, contract)

  // Replace the maker's dummy witnessUtxo on taker's input with the real one
  const script = OutScript.encode(Address(REGTEST).decode(walletKey.address))
  tx.updateInput(1, {
    witnessUtxo: { script, amount: BigInt(contract.takerInput.amount) },
    tapInternalKey: hexToBytes(walletKey.pubkey),
  })

  const takerPrivkey = await getDecryptedPrivkey(walletKey)
  tx.signIdx(hexToBytes(takerPrivkey), 1)
  tx.finalize()

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { status: 'funded', fundingTxid: txid, updatedAt: Date.now() })
  return txid
}

// ── refund via CLTV (either party, after resolutionBlockheight + REFUND_DELAY) ─

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

  const feeRate = await electrum.getFeeRate()
  const fee = refundFee(feeRate)

  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true, lockTime: locktime })
  tx.addInput({
    txid: contract.fundingTxid,
    index: outputIdx,
    witnessUtxo: { script: output.script, amount: BigInt(stake) },
    tapLeafScript: [output.tapLeafScript![CLTV_LEAF_IDX]],
    sequence: 0xFFFFFFFE,
  })
  tx.addOutputAddress(walletKey.address, BigInt(stake - fee), REGTEST)

  const refundPrivkey = await getDecryptedPrivkey(walletKey)
  tx.signIdx(hexToBytes(refundPrivkey), 0)
  tx.finalize()

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { status: 'refunded', updatedAt: Date.now() })
  return txid
}

// ── claim winnings (winner, after oracle resolution) ─────────────────────────

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

  const feeRate = await electrum.getFeeRate()
  const fee = claimFee(feeRate)

  const leafIdx = isMakerWinner ? YES_LEAF_IDX : NO_LEAF_IDX
  const preimageBytes = hexToBytes(contract.winningPreimage)
  const privkeyBytes = hexToBytes(await getDecryptedPrivkey(walletKey))
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

  tx.addOutputAddress(payoutAddress, BigInt(totalAmount - fee), REGTEST)

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
    const leafScript = scriptWithVersion.subarray(0, -1)
    const cb = TaprootControlBlock.encode(cbDecoded)
    tx.updateInput(i, { finalScriptWitness: [sig, preimageBytes, leafScript, cb] }, true)
  }

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { claimTxid: txid, updatedAt: Date.now() })
  return txid
}

// ── send sats from wallet to an external address ─────────────────────────────

function selectCoins(
  utxos: WalletUTXO[],
  target: number,
  feeRate: number,
): { selected: WalletUTXO[]; fee: number; change: number } | null {
  // sort smallest first (minimize waste)
  const sorted = [...utxos].sort((a, b) => a.utxo.value - b.utxo.value)
  const selected: WalletUTXO[] = []
  let sum = 0

  for (const u of sorted) {
    selected.push(u)
    sum += u.utxo.value
    const fee = sendFee(selected.length, feeRate)
    if (sum >= target + fee) {
      return { selected, fee, change: sum - target - fee }
    }
  }
  return null
}

export async function sendFromWallet(
  utxos: WalletUTXO[],
  toAddress: string,
  amountSats: number,
  changeAddress: string,
  electrum: ElectrumWS,
): Promise<string> {
  if (amountSats <= 0) throw new Error('amount must be positive')

  const feeRate = await electrum.getFeeRate()
  const result = selectCoins(utxos, amountSats, feeRate)
  if (!result) throw new Error('insufficient funds')

  const { selected, fee, change } = result

  const tx = new Transaction({ allowUnknownOutputs: true })

  for (const { utxo, key, script } of selected) {
    tx.addInput({
      txid: utxo.tx_hash,
      index: utxo.tx_pos,
      witnessUtxo: { script, amount: BigInt(utxo.value) },
      tapInternalKey: hexToBytes(key.pubkey),
    })
  }

  tx.addOutputAddress(toAddress, BigInt(amountSats), REGTEST)

  if (change > 546) {
    tx.addOutputAddress(changeAddress, BigInt(change), REGTEST)
  }

  for (let i = 0; i < selected.length; i++) {
    const privkey = await getDecryptedPrivkey(selected[i].key)
    tx.signIdx(hexToBytes(privkey), i)
  }

  tx.finalize()
  return electrum.broadcastTx(tx.hex)
}

// ── consolidate selected UTXOs into a single output ───────────────────────────

export async function consolidateUtxos(
  utxos: WalletUTXO[],
  toAddress: string,
  electrum: ElectrumWS,
): Promise<string> {
  if (utxos.length === 0) throw new Error('no UTXOs selected')

  const feeRate = await electrum.getFeeRate()
  const fee = sendFee(utxos.length, feeRate)
  const total = utxos.reduce((s, u) => s + u.utxo.value, 0)
  const netAmount = total - fee
  if (netAmount <= 546) throw new Error(`not enough to cover fee (${fee} sats)`)

  const tx = new Transaction({ allowUnknownOutputs: true })

  for (const { utxo, key, script } of utxos) {
    tx.addInput({
      txid: utxo.tx_hash,
      index: utxo.tx_pos,
      witnessUtxo: { script, amount: BigInt(utxo.value) },
      tapInternalKey: hexToBytes(key.pubkey),
    })
  }

  tx.addOutputAddress(toAddress, BigInt(netAmount), REGTEST)

  for (let i = 0; i < utxos.length; i++) {
    const privkey = await getDecryptedPrivkey(utxos[i].key)
    tx.signIdx(hexToBytes(privkey), i)
  }

  tx.finalize()
  return electrum.broadcastTx(tx.hex)
}
