import { KIND_OFFER, KIND_DM } from './kinds'
import { getNostr } from './signer'
import type { NostrEvent } from 'nostr-tools'
import { SigHash } from '@scure/btc-signer'
import type { Contract } from '../db'
import { buildFundingTx } from './contract'
import type { WalletUTXO } from '../hooks/useWallet'
import type { TakeRequest, TakerInput } from './types'
import { db } from '../db'
import { hexToBytes } from './utils'
import { getDecryptedPrivkey } from './pinCrypto'
import { Market, Offer, takerStake } from './market'

/**
 * Send a request to the market maker with change address, inputs to use for the psbt.  
 */
export async function sendTakeRequest(
  publish: (event: NostrEvent) => Promise<void>,
  market: Market,
  offer: Offer,
  input: TakerInput,
  changeAddress: string,
  walletKeyId: string,
): Promise<void> {
  const nostr = getNostr()
  if (!nostr) throw new Error('no nostr signer found')
  if (!nostr.nip44) throw new Error('nostr signer does not support NIP-44')

  const takerPubkey = await nostr.getPublicKey()
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

  const ciphertext = await nostr.nip44!.encrypt(offer.makerPubkey, payload)

  const dmSigned = await nostr.signEvent({
    kind: KIND_DM,
    pubkey: takerPubkey,
    created_at: Math.floor(now / 1000),
    tags: [['p', offer.makerPubkey], ['a', `30051:${offer.makerPubkey}:${offer.id}`]],
    content: ciphertext,
  })
  await publish(dmSigned)

  await db.contracts.put({
    id: offer.id,
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
    contractId: offer.id,
    direction: 'out',
    type: 'take_request',
    payload,
    createdAt: now,
  })
}



/**
 * Response to the offer.
 * @param publish 
 * @param contract 
 * @param taker 
 * @param maker 
 */
export async function sendFundingPsbt(
  publish: (event: NostrEvent) => Promise<void>,
  contract: Contract,
  taker: TakeRequest,
  maker: { funding: WalletUTXO; changeAddress: string },
): Promise<void> {
  const nostr = getNostr()
  if (!nostr?.nip44) throw new Error('nostr signer with NIP-44 required')

  const makerPubkey = await nostr.getPublicKey()
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

  const makerPrivkey = await getDecryptedPrivkey(maker.funding.key)
  tx.signIdx(hexToBytes(makerPrivkey), 0, [SigHash.ALL_ANYONECANPAY])
  const psbt = btoa(String.fromCharCode(...tx.toPSBT()))

  const payload = JSON.stringify({ type: 'psbt_offer', funding_psbt: psbt, maker_wallet_pubkey: makerWalletPubkey })
  const ciphertext = await nostr.nip44!.encrypt(taker.taker_pubkey, payload)
  const now = Date.now()

  const signed = await nostr.signEvent({
    kind: KIND_DM,
    pubkey: makerPubkey,
    created_at: Math.floor(now / 1000),
    tags: [['p', taker.taker_pubkey], ['a', `30051:${makerPubkey}:${contract.id}`]],
    content: ciphertext,
  } as NostrEvent)

  await publish(signed)


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
