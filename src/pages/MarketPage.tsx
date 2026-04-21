import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext } from '../context/ElectrumContext'
import { parseMarket, parseOffer, tag } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import type { Resolution } from './MarketsPage'
import { MarketDetail } from '../components/markets/MarketDetail'

export default function MarketPage() {
  const { marketId } = useParams<{ marketId: string }>()
  const navigate = useNavigate()
  const { subscribe } = useRelayContext()
  const { blockHeight } = useElectrumContext()

  const [market, setMarket] = useState<Market | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [resolution, setResolution] = useState<Resolution | undefined>()

  useEffect(() => {
    if (!marketId) return

    const unsub = subscribe(
      `market-page:${marketId}`,
      [
        { kinds: [8050], '#d': [marketId] },
        { kinds: [30051] },
        { kinds: [8052], '#d': [marketId] },
      ],
      (event: NostrEvent) => {
        if (event.kind === 8050) {
          setMarket(parseMarket(event))
        } else if (event.kind === 30051) {
          const mid = tag(event, 'm') || tag(event, 'market_id')
          if (mid !== marketId) return
          const offer = parseOffer(event)
          setOffers(prev => {
            const idx = prev.findIndex(o => o.id === offer.id)
            if (idx >= 0) { const u = [...prev]; u[idx] = offer; return u }
            return [...prev, offer]
          })
        } else if (event.kind === 8052) {
          const outcome = tag(event, 'outcome') as 'YES' | 'NO'
          const preimage = tag(event, 'preimage')
          if (outcome) setResolution({ outcome, preimage })
        }
      },
    )

    return unsub
  }, [marketId, subscribe])

  if (!market) {
    return (
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors mb-8">
          <span>←</span> back
        </button>
        <div className="text-center text-ink/30 text-sm py-24">loading market…</div>
      </main>
    )
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <MarketDetail
        market={market}
        offers={offers}
        resolution={resolution}
        blockHeight={blockHeight}
        onBack={() => navigate(-1)}
      />
    </main>
  )
}
