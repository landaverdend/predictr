import { useEffect } from 'react'
import { useRelayContext } from '../context/RelayContext'
import { db } from '../db'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { NostrEvent } from 'nostr-tools'

/**
 * Subscribes to the user's Kind 14 DM inbox and decrypts each message.
 * Resolves the pubkey from window.nostr internally, then subscribes.
 * Writes incoming messages + contract state updates to Dexie.
 */
export function useCheckOffers() {
  const { subscribe } = useRelayContext()

  const pendingMakerContracts = useLiveQuery(
    () => db.contracts.where('status').equals('offer_pending').and(c => c.role === 'maker').toArray(),
    []
  ) ?? []

  const pendingTakerContracts = useLiveQuery(
    () => db.contracts.where('status').equals('awaiting_psbt').toArray(),
  ) ?? []


  useEffect(() => {
    let makerUnsub: (() => void) | undefined;
    let takerUnsub: (() => void) | undefined;

    window.nostr?.getPublicKey().then(pubkey => {

      const makerATags = pendingMakerContracts.map(c => `30051:${pubkey}:${c.id}`)

      makerUnsub = subscribe('check-offers-maker', [{ kinds: [14], '#a': makerATags }], async event => {

        if (!window.nostr?.nip44) { toast.error('nostr extension does not support NIP-44'); return }

        const plaintext = await window.nostr.nip44.decrypt(event.pubkey, event.content);
        const msg = JSON.parse(plaintext) as { type: string;[k: string]: unknown }

        const contractId = event.tags.find(t => t[0] === 'a')?.[1].split(':')[2] ?? ''

        const now = Date.now();

        // Check if the message has already been stored, if so, skip.
        const alreadyStored = await db.messages.get(event.id)
        if (alreadyStored) return;


        switch (msg.type) {
          case 'take_request': {
            const contract = await db.contracts.get(contractId)
            if (!contract || contract.role !== 'maker') { toast.error(`contract ${contractId} not found`); return }

            if (contract.status === 'offer_pending') {
              toast.info('Buyer is interested in your market for: ' + contract.marketQuestion)
              await db.contracts.update(contractId, { unread: true, updatedAt: now })
            }

            break;
          }

          // case 'psbt_offer': {
          //   console.log('psbt_offer ', msg)
          //   const contract = await db.contracts.get(contractId);
          //   if (!contract || contract.role !== 'taker') { toast.error(`contract ${contractId} not found`); return }

          //   if (contract.status === 'awaiting_psbt') {
          //     toast.info('Market maker has sent you a funding PSBT for your offer for: ' + contract.marketQuestion)
          //     await db.contracts.update(contractId, { unread: true, updatedAt: now, status: 'psbt_received' })
          //   }
          //   break;
          // }

          default: {
            toast.error('unknown message type')
            break;
          }
        }

        // Finally, store the message in dexie to prevent future duplicate processing.
        await db.messages.put({
          id: event.id,
          contractId: contractId,
          direction: 'in',
          type: msg.type as 'take_request' | 'psbt_offer',
          payload: plaintext,
          createdAt: event.created_at * 1000,
        })

      })

      // Tags for contracts where the user is the taker
      const takerATags = pendingTakerContracts.map(c => `30051:${c.counterpartyPubkey}:${c.id}`)

      takerUnsub = subscribe('check-offers-taker', [{ kinds: [14], '#a': takerATags }], async event => {
        console.log('taker dm received', event)

        if (!window.nostr?.nip44) { toast.error('nostr extension does not support NIP-44'); return }

        const plaintext = await window.nostr.nip44.decrypt(event.pubkey, event.content);
        const msg = JSON.parse(plaintext) as { type: string;[k: string]: unknown }

        console.log('msg ', msg)
        const contractId = event.tags.find(t => t[0] === 'a')?.[1].split(':')[2] ?? ''

        const now = Date.now();

        // Check if the message has already been stored, if so, skip.
        const alreadyStored = await db.messages.get(event.id)
        if (alreadyStored) return;


        switch (msg.type) {
          case 'psbt_offer': {
            const contract = await db.contracts.get(contractId)
            if (!contract || contract.role !== 'taker') { toast.error(`contract ${contractId} not found`); return }

            if (contract.status === 'awaiting_psbt') {
              toast.info('Market maker has sent you a funding PSBT for your offer for: ' + contract.marketQuestion)
              await db.contracts.update(contractId, {
                unread: true,
                updatedAt: now,
                status: 'psbt_received',
                fundingPsbt: msg.funding_psbt as string,
                makerWalletPubkey: msg.maker_wallet_pubkey as string,
              })
            }
            break;
          }

          default: {
            toast.error('unknown message type')
            break;
          }
        }

        // Finally, store the message in dexie to prevent future duplicate processing.
        await db.messages.put({
          id: event.id,
          contractId: contractId,
          direction: 'in',
          type: msg.type as 'take_request' | 'psbt_offer',
          payload: plaintext,
          createdAt: event.created_at * 1000,
        })

      })


    })

    return () => { makerUnsub?.(); takerUnsub?.() }
  }, [subscribe, pendingMakerContracts])
}
