import type { NostrEvent } from 'nostr-tools'
import { SigHash } from '@scure/btc-signer'
import type { Contract } from '../db'
import { buildFundingTx } from './contract'
import type { WalletUTXO } from '../hooks/useWallet'
import { db } from '../db'

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

export async function sendFundingPsbt(
  publish: (event: NostrEvent) => Promise<void>,
  contract: Contract,
  maker: { funding: WalletUTXO; changeAddress: string },
): Promise<void> {
  if (!window.nostr?.nip44) throw new Error('nostr extension with NIP-44 required')
  if (!contract.takerInput || !contract.takerChangeAddress) throw new Error('missing taker input data')

  const makerPubkey = await window.nostr.getPublicKey()

  const tx = buildFundingTx(
    {
      yesHash: contract.yesHash,
      noHash: contract.noHash,
      makerPubkey,
      takerPubkey: contract.counterpartyPubkey,
      resolutionBlockheight: contract.resolutionBlockheight,
    },
    {
      utxo: { txid: maker.funding.utxo.tx_hash, vout: maker.funding.utxo.tx_pos, amount: maker.funding.utxo.value, script: maker.funding.script, pubkey: hexToBytes(maker.funding.key.pubkey) },
      stake: contract.makerStake,
      changeAddress: maker.changeAddress,
    },
    {
      input: contract.takerInput,
      stake: contract.takerStake,
      changeAddress: contract.takerChangeAddress,
    },
  )

  tx.signIdx(hexToBytes(maker.funding.key.privkey), 0, [SigHash.ALL_ANYONECANPAY])
  const psbt = btoa(String.fromCharCode(...tx.toPSBT()))

  const payload = JSON.stringify({ type: 'psbt_offer', funding_psbt: psbt })
  const ciphertext = await window.nostr.nip44.encrypt(contract.counterpartyPubkey, payload)
  const now = Date.now()

  const signed = await window.nostr.signEvent({
    kind: 14,
    pubkey: makerPubkey,
    created_at: Math.floor(now / 1000),
    tags: [['p', contract.counterpartyPubkey], ['e', contract.id]],
    content: ciphertext,
  } as NostrEvent)

  await publish(signed)

  await Promise.all([
    db.contracts.update(contract.id, { status: 'psbt_sent', fundingPsbt: psbt, updatedAt: now }),
    db.messages.put({
      id: signed.id,
      contractId: contract.id,
      direction: 'out',
      type: 'psbt_offer',
      payload,
      createdAt: now,
    }),
  ])
}
