import { useEffect } from 'react'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts } from '../lib/contract'
import { useElectrum } from './useElectrum'
import { KIND_OFFER } from '../lib/kinds'
import { useRelayContext } from '../context/RelayContext'
import { toast } from 'sonner'
import { getNostr } from '../lib/signer'

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

    async function check() {
      await Promise.all(watchable.map(async contract => {
        const { makerOutput } = buildContractOutputScripts({
          yesHash: contract.yesHash,
          noHash: contract.noHash,
          makerPubkey: contract.makerWalletPubkey!,
          takerPubkey: contract.takerWalletPubkey!,
          resolutionBlockheight: contract.resolutionBlockheight,
        })

        const utxos = await client!.getUTXOs(makerOutput.address!)
        if (!utxos.length) return

        await db.contracts.update(contract.id, {
          status: 'funded',
          fundingTxid: utxos[0].tx_hash,
          updatedAt: Date.now(),
        })
        toast.success(`Contract funded: ${contract.marketQuestion}`)

        const nostr = getNostr()
        if (contract.id && nostr) {
          const pubkey = await nostr.getPublicKey()
          const signed = await nostr.signEvent({
            kind: KIND_OFFER,
            pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ['d', contract.id],
              ['e', contract.announcementEventId],
              ['m', contract.marketId],
              ['oracle', contract.oraclePubkey],
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
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [contracts, client])
}
