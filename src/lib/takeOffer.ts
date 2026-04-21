import type { NostrEvent } from 'nostr-tools'
import type { Market, Offer } from './market'
import { takerStake } from './market'
import type { TakerInput, TakeRequest } from './types'
import { db } from '../db'

export async function sendTakeRequest(
  publish: (event: NostrEvent) => Promise<void>,
  market: Market,
  offer: Offer,
  input: TakerInput,
  changeAddress: string,
  walletKeyId: string,
): Promise<void> {
  if (!window.nostr) throw new Error('no nostr extension found')
  if (!window.nostr.nip44) throw new Error('nostr extension does not support NIP-44')

  const takerPubkey = await window.nostr.getPublicKey()
  const now = Date.now()
  const impliedTakerStake = takerStake(offer)

  const walletKey = await db.wallet.get(walletKeyId)
  if (!walletKey) throw new Error('wallet key not found')

  const takeRequest: TakeRequest = {
    type: 'take_request',
    taker_pubkey: takerPubkey,
    taker_wallet_pubkey: walletKey.pubkey,
    input,
    change_address: changeAddress,
  }
  const payload = JSON.stringify(takeRequest)

  const ciphertext = await window.nostr.nip44.encrypt(offer.makerPubkey, payload)

  const dmSigned = await window.nostr.signEvent({
    kind: 14,
    pubkey: takerPubkey,
    created_at: Math.floor(now / 1000),
    tags: [['p', offer.makerPubkey], ['e', offer.eventId]],
    content: ciphertext,
  })
  await publish(dmSigned)

  await db.contracts.put({
    id: offer.eventId,
    role: 'taker',
    status: 'awaiting_psbt',
    side: offer.side,
    marketId: market.id,
    marketQuestion: market.question,
    oraclePubkey: market.pubkey,
    announcementEventId: market.eventId,
    yesHash: market.yesHash,
    noHash: market.noHash,
    resolutionBlockheight: market.resolutionBlockheight,
    counterpartyPubkey: offer.makerPubkey,
    makerStake: offer.makerStake,
    confidence: offer.confidence,
    takerStake: impliedTakerStake,
    takerInput: input,
    takerChangeAddress: changeAddress,
    takerWalletKeyId: walletKeyId,
    takerWalletPubkey: walletKey.pubkey,
    createdAt: now,
    updatedAt: now,
    unread: false,
  })

  await db.messages.put({
    id: dmSigned.id,
    contractId: offer.eventId,
    direction: 'out',
    type: 'take_request',
    payload,
    createdAt: now,
  })
}
