import type { NostrEvent } from 'nostr-tools'
import { SigHash } from '@scure/btc-signer'
import type { Contract } from '../db'
import { buildFundingTx } from './contract'
import type { WalletUTXO } from '../hooks/useWallet'
import type { TakeRequest } from './types'
import { db } from '../db'
import { hexToBytes } from './utils'

export async function sendFundingPsbt(
  publish: (event: NostrEvent) => Promise<void>,
  contract: Contract,
  taker: TakeRequest,
  maker: { funding: WalletUTXO; changeAddress: string },
): Promise<void> {
  if (!window.nostr?.nip44) throw new Error('nostr extension with NIP-44 required')

  const makerPubkey = await window.nostr.getPublicKey()
  const makerWalletPubkey = maker.funding.key.pubkey

  const tx = buildFundingTx(
    {
      yesHash: contract.yesHash,
      noHash: contract.noHash,
      makerPubkey: makerWalletPubkey,
      takerPubkey: taker.taker_wallet_pubkey,
      resolutionBlockheight: contract.resolutionBlockheight,
    },
    {
      utxo: { txid: maker.funding.utxo.tx_hash, vout: maker.funding.utxo.tx_pos, amount: maker.funding.utxo.value, script: maker.funding.script, pubkey: hexToBytes(maker.funding.key.pubkey) },
      stake: contract.makerStake,
      changeAddress: maker.changeAddress,
    },
    {
      input: taker.input,
      stake: contract.takerStake,
      changeAddress: taker.change_address,
    },
  )

  tx.signIdx(hexToBytes(maker.funding.key.privkey), 0, [SigHash.ALL_ANYONECANPAY])
  const psbt = btoa(String.fromCharCode(...tx.toPSBT()))

  const payload = JSON.stringify({ type: 'psbt_offer', funding_psbt: psbt, maker_wallet_pubkey: makerWalletPubkey })
  const ciphertext = await window.nostr.nip44.encrypt(taker.taker_pubkey, payload)
  const now = Date.now()

  const signed = await window.nostr.signEvent({
    kind: 14,
    pubkey: makerPubkey,
    created_at: Math.floor(now / 1000),
    tags: [['p', taker.taker_pubkey], ['e', contract.id]],
    content: ciphertext,
  } as NostrEvent)

  await publish(signed)

  // Mark the offer as filled on the relay (replaces the Kind 30051 via d-tag)
  if (contract.offerDTag) {
    const filledOffer = await window.nostr.signEvent({
      kind: 30051,
      pubkey: makerPubkey,
      created_at: Math.floor(now / 1000),
      tags: [
        ['d', contract.offerDTag],
        ['e', contract.announcementEventId],
        ['m', contract.marketId],
        ['oracle', contract.oraclePubkey],
        ['side', contract.side],
        ['maker_stake', String(contract.makerStake)],
        ['confidence', String(contract.confidence)],
        ['status', 'filled'],
      ],
      content: '',
    } as NostrEvent)
    await publish(filledOffer)
  }

  await Promise.all([
    db.contracts.update(contract.id, {
      status: 'psbt_sent',
      fundingPsbt: psbt,
      makerWalletKeyId: maker.funding.key.id,
      makerWalletPubkey: makerWalletPubkey,
      counterpartyPubkey: taker.taker_pubkey,
      takerInput: taker.input,
      takerChangeAddress: taker.change_address,
      takerWalletPubkey: taker.taker_wallet_pubkey,
      updatedAt: now,
    }),
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
