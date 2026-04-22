import { useEffect } from 'react'
import type { Contract } from '../db'
import { db } from '../db'
import { useRelayContext } from '../context/RelayContext'
import { KIND_RESOLUTION } from '../lib/kinds'

export function useWatchResolution(contracts: Contract[]) {
  const { subscribe } = useRelayContext()

  useEffect(() => {
    const funded = contracts.filter(c => c.status === 'funded')
    if (!funded.length) return

    const announcementIds = funded.map(c => c.announcementEventId)

    const unsub = subscribe(
      'resolution-watch',
      [{ kinds: [KIND_RESOLUTION], '#e': announcementIds }],
      async event => {
        const announcementEventId = event.tags.find(t => t[0] === 'e')?.[1]
        if (!announcementEventId) return

        const contract = funded.find(c => c.announcementEventId === announcementEventId)
        if (!contract) return

        const outcome = event.tags.find(t => t[0] === 'outcome')?.[1] as 'YES' | 'NO' | undefined
        const preimage = event.tags.find(t => t[0] === 'preimage')?.[1]
        if (!outcome || !preimage) return

        await db.contracts.update(contract.id, {
          status: 'resolved',
          outcome,
          winningPreimage: preimage,
          updatedAt: Date.now(),
        })
      },
    )

    return unsub
  }, [contracts, subscribe])
}
