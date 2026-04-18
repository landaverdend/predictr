import type { NostrEvent } from 'nostr-tools'
import { Address, OutScript } from '@scure/btc-signer'
import type { Contract } from '../db'
import { buildFundingPsbt, REGTEST } from './contract'
import type { ElectrumUTXO } from './electrum'
import { db } from '../db'

export async function sendFundingPsbt(
  publish: (event: NostrEvent) => Promise<void>,
  contract: Contract,
  maker: { utxo: ElectrumUTXO; fundingAddress: string; changeAddress: string },
): Promise<void> {
  if (!window.nostr?.nip44) throw new Error('nostr extension with NIP-44 required')
  if (!contract.takerInput || !contract.takerChangeAddress) throw new Error('missing taker input data')

  const makerPubkey = await window.nostr.getPublicKey()
  const script = OutScript.encode(Address(REGTEST).decode(maker.fundingAddress))

  const psbt = buildFundingPsbt(
    {
      yesHash: contract.yesHash,
      noHash: contract.noHash,
      makerPubkey,
      takerPubkey: contract.counterpartyPubkey,
      resolutionBlockheight: contract.resolutionBlockheight,
    },
    {
      utxo: { txid: maker.utxo.tx_hash, vout: maker.utxo.tx_pos, amount: maker.utxo.value, script },
      stake: contract.makerStake,
      changeAddress: maker.changeAddress,
    },
    {
      input: contract.takerInput,
      stake: contract.takerStake,
      changeAddress: contract.takerChangeAddress,
    },
  )

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
