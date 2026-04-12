import { useEffect } from 'react'
import { useRelayContext } from '../context/RelayContext'
import { db } from '../db'

/**
 * Subscribes to the user's Kind 14 DM inbox and decrypts each message.
 * Writes incoming messages + contract state updates to Dexie.
 *
 * Must be mounted once at a top level (App) after pubkey is known.
 */
export function useDMs(pubkey: string | null) {
  const { subscribe } = useRelayContext()

  useEffect(() => {
    if (!pubkey) return

    const unsub = subscribe(
      'dm-inbox',
      [{ kinds: [14], '#p': [pubkey] }],
      async event => {
        if (!window.nostr?.nip44) return


        try {
          const plaintext = await window.nostr.nip44.decrypt(event.pubkey, event.content)
          const msg = JSON.parse(plaintext) as { type: string;[k: string]: unknown }

          const offerEventId = event.tags.find(t => t[0] === 'e')?.[1]
          if (!offerEventId) return

          const now = Date.now()

          // Avoid double-processing
          const alreadyStored = await db.messages.get(event.id)
          if (alreadyStored) return

          await db.messages.put({
            id: event.id,
            contractId: offerEventId,
            direction: 'in',
            type: msg.type as 'take_request' | 'psbt_offer',
            payload: plaintext,
            createdAt: event.created_at * 1000,
          })

          if (msg.type === 'take_request') {
            // We're the maker — taker wants in
            const contract = await db.contracts.get(offerEventId)
            if (!contract || contract.role !== 'maker') return

            // Only accept the first taker (ignore subsequent take_requests)
            if (contract.status !== 'offer_pending') return

            const input = msg.input as { txid: string; vout: number; amount: number }
            await db.contracts.update(offerEventId, {
              status: 'take_received',
              counterpartyPubkey: msg.taker_pubkey as string,
              takerInput: input,
              takerChangeAddress: msg.change_address as string,
              updatedAt: now,
            })
          } else if (msg.type === 'psbt_offer') {
            // We're the taker — maker sent us a PSBT
            const contract = await db.contracts.get(offerEventId)
            if (!contract || contract.role !== 'taker') return
            if (contract.status !== 'awaiting_psbt') return

            await db.contracts.update(offerEventId, {
              status: 'psbt_sent',  // from taker's POV: psbt received, pending verification
              fundingPsbt: msg.funding_psbt as string,
              updatedAt: now,
            })
          }
        } catch {
          // decrypt failed (wrong key) or malformed JSON — ignore
        }
      },
    )

    return unsub
  }, [pubkey, subscribe])
}
