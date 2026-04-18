import { useEffect } from 'react'
import { useRelayContext } from '../context/RelayContext'
import { db } from '../db'

/**
 * Subscribes to the user's Kind 14 DM inbox and decrypts each message.
 * Resolves the pubkey from window.nostr internally, then subscribes.
 * Writes incoming messages + contract state updates to Dexie.
 */
export function useDMs() {
  const { subscribe } = useRelayContext()

  useEffect(() => {
    let unsub: (() => void) | undefined

    window.nostr?.getPublicKey().then(pubkey => {
      unsub = subscribe(
        'dm-inbox',
        [{ kinds: [14], '#p': [pubkey] }],
        async event => {
          if (!window.nostr?.nip44) throw new Error('nostr extension does not support NIP-44')

          const plaintext = await window.nostr.nip44.decrypt(event.pubkey, event.content)
          const msg = JSON.parse(plaintext) as { type: string;[k: string]: unknown }

          const offerEventId = event.tags.find(t => t[0] === 'e')?.[1]
          if (!offerEventId) return

          const now = Date.now()

          const alreadyStored = await db.messages.get(event.id)
          if (alreadyStored) return

          if (msg.type === 'take_request') {
            const contract = await db.contracts.get(offerEventId)
            if (!contract || contract.role !== 'maker') return
            if (contract.status !== 'offer_pending') return

            await db.contracts.update(offerEventId, {
              status: 'take_received',
              counterpartyPubkey: msg.taker_pubkey as string,
              takerInput: msg.input as { txid: string; vout: number; amount: number },
              takerChangeAddress: msg.change_address as string,
              takerWalletPubkey: msg.taker_wallet_pubkey as string,
              updatedAt: now,
            })
          } else if (msg.type === 'psbt_offer') {
            const contract = await db.contracts.get(offerEventId)
            if (!contract || contract.role !== 'taker') return
            if (contract.status !== 'awaiting_psbt') return

            await db.contracts.update(offerEventId, {
              status: 'psbt_sent',
              fundingPsbt: msg.funding_psbt as string,
              makerWalletPubkey: msg.maker_wallet_pubkey as string,
              updatedAt: now,
            })
          }

          await db.messages.put({
            id: event.id,
            contractId: offerEventId,
            direction: 'in',
            type: msg.type as 'take_request' | 'psbt_offer',
            payload: plaintext,
            createdAt: event.created_at * 1000,
          })
        },
      )
    })

    return () => unsub?.()
  }, [subscribe])
}
