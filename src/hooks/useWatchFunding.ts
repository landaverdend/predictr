import { useEffect } from 'react'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts } from '../lib/contract'
import { useElectrum } from './useElectrum'
import { useRelayContext } from '../context/RelayContext'

export function useWatchFunding(contracts: Contract[]) {
  const { client } = useElectrum()
  const { publish } = useRelayContext()

  useEffect(() => {
    if (!client) return

    const watchable = contracts.filter(c =>
      c.role === 'maker' &&
      c.status === 'psbt_sent' &&
      c.makerWalletPubkey &&
      c.takerWalletPubkey
    )

    if (!watchable.length) return

    Promise.all(watchable.map(async contract => {
      const { makerOutput } = buildContractOutputScripts({
        yesHash: contract.yesHash,
        noHash: contract.noHash,
        makerPubkey: contract.makerWalletPubkey!,
        takerPubkey: contract.takerWalletPubkey!,
        resolutionBlockheight: contract.resolutionBlockheight,
      })

      const utxos = await client.getUTXOs(makerOutput.address!)
      if (!utxos.length) return

      await db.contracts.update(contract.id, {
        status: 'funded',
        fundingTxid: utxos[0].tx_hash,
        updatedAt: Date.now(),
      })

      if (contract.offerDTag && window.nostr) {
        const pubkey = await window.nostr.getPublicKey()
        const signed = await window.nostr.signEvent({
          kind: 30051,
          pubkey,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['d', contract.offerDTag],
            ['e', contract.announcementEventId],
            ['oracle', contract.oraclePubkey],
            ['market_id', contract.marketId],
            ['side', contract.side],
            ['maker_stake', String(contract.makerStake)],
            ['confidence', String(contract.confidence)],
            ['status', 'filled'],
          ],
          content: '',
        })
        await publish(signed)
      }
    }))
  }, [contracts, client])
}
