import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useElectrum } from './useElectrum'

export function useTransactionHistory(enabled: boolean) {
  const keys = useLiveQuery(() => db.wallet.toArray(), [])
  const { client } = useElectrum()
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Live query from DB — always up to date, loads instantly
  const history = useLiveQuery(
    () => db.transactions.orderBy('seenAt').reverse().toArray(),
    [],
  ) ?? []

  // Fetch from network when tab becomes active
  useEffect(() => {
    if (!enabled || !keys?.length || !client) return

    setFetching(true)
    setError(null)

    async function refresh() {
      const results = await Promise.allSettled(
        keys!.map(async k => {
          const items = await client!.getTxHistory(k.address)
          return { address: k.address, items }
        })
      )

      const now = Date.now()
      const toUpsert = []

      for (const r of results) {
        if (r.status !== 'fulfilled') continue
        for (const item of r.value.items) {
          toUpsert.push({
            txid: item.txid,
            height: item.height,
            blockTime: item.blockTime,
            address: r.value.address,
            seenAt: now,
          })
        }
      }

      // Preserve original seenAt for known txids, update height for confirmations
      const existing = await db.transactions.bulkGet(toUpsert.map(t => t.txid))
      const merged = toUpsert.map((t, i) => ({
        ...t,
        seenAt: existing[i]?.seenAt ?? t.seenAt,
      }))

      await db.transactions.bulkPut(merged)
      setFetching(false)
    }

    refresh().catch(e => {
      setError(e instanceof Error ? e.message : String(e))
      setFetching(false)
    })
  }, [enabled, keys, client])

  return { history, fetching, error }
}
