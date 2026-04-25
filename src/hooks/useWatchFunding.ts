import { useEffect } from 'react'
import type { Contract } from '../db'
import { db } from '../db'
import { buildContractOutputScripts } from '../lib/contract'
import { useElectrum } from './useElectrum'
import { toast } from 'sonner'

export function useWatchFunding(contracts: Contract[]) {
  const { client } = useElectrum()

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
        // No longer republish offer — fill receipt is posted by the taker
      }))
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [contracts, client])
}
