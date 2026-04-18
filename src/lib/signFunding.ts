import { Transaction, Address, OutScript } from '@scure/btc-signer'
import type { Contract } from '../db'
import { db } from '../db'
import { REGTEST } from './contract'
import type { ElectrumWS } from './electrum'

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

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

  // Replace the maker's dummy witnessUtxo on taker's input with the real one
  const script = OutScript.encode(Address(REGTEST).decode(walletKey.address))
  tx.updateInput(1, {
    witnessUtxo: { script, amount: BigInt(contract.takerInput.amount) },
    tapInternalKey: hexToBytes(walletKey.pubkey),
  })

  tx.signIdx(hexToBytes(walletKey.privkey), 1)
  tx.finalize()

  const txid = await electrum.broadcastTx(tx.hex)
  await db.contracts.update(contract.id, { status: 'funded', fundingTxid: txid, updatedAt: Date.now() })

  return txid
}
