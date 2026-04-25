import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext } from '../context/ElectrumContext'
import { parseMarket, parseOffer, tag } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import type { Resolution } from './MarketsPage'
import { MarketDetail } from '../components/markets/MarketDetail'
import { KIND_MARKET_ANNOUNCEMENT, KIND_OFFER, KIND_RESOLUTION } from '../lib/kinds'

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
        { kinds: [KIND_MARKET_ANNOUNCEMENT], '#d': [marketId] },
        { kinds: [KIND_OFFER] },
        { kinds: [KIND_RESOLUTION], '#d': [marketId] },
      ],
      (event: NostrEvent) => {
        if (event.kind === KIND_MARKET_ANNOUNCEMENT) {
          setMarket(parseMarket(event))
        } else if (event.kind === KIND_OFFER) {
          const mid = tag(event, 'm') || tag(event, 'market_id')
          if (mid !== marketId) return
          const offer = parseOffer(event)
          setOffers(prev => {
            const idx = prev.findIndex(o => o.id === offer.id)
            if (idx >= 0) { const u = [...prev]; u[idx] = offer; return u }
            return [...prev, offer]
          })
        } else if (event.kind === KIND_RESOLUTION) {
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
        <div className="space-y-6">
          {/* Card skeleton */}
          <div className="border border-ink/10 rounded-xl overflow-hidden">
            {/* Image */}
            <div className="w-full h-64 bg-gradient-to-r from-ink/5 via-ink/10 to-ink/5 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]" />
            <div className="p-6 space-y-6">
              {/* Title */}
              <div className="space-y-2.5">
                <div className="h-5 rounded bg-ink/8 animate-pulse w-full" />
                <div className="h-5 rounded bg-ink/8 animate-pulse w-3/4" />
              </div>
              {/* YES/NO buttons */}
              <div className="flex gap-2 mt-5">
                <div className="flex-1 h-10 rounded-xl bg-positive/8 animate-pulse" />
                <div className="flex-1 h-10 rounded-xl bg-negative/8 animate-pulse" />
              </div>
              {/* Sentiment bar */}
              <div className="space-y-2">
                <div className="h-2.5 rounded-full bg-ink/8 animate-pulse" />
                <div className="flex justify-between">
                  <div className="h-3 w-12 rounded bg-ink/8 animate-pulse" />
                  <div className="h-3 w-12 rounded bg-ink/8 animate-pulse" />
                </div>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[0,1,2].map(i => (
                  <div key={i} className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5 space-y-2">
                    <div className="h-2.5 w-16 rounded bg-ink/8 animate-pulse mx-auto" />
                    <div className="h-6 w-10 rounded bg-ink/8 animate-pulse mx-auto" />
                  </div>
                ))}
              </div>
              {/* Oracle row */}
              <div className="flex items-center gap-3 pt-3 border-t border-ink/8">
                <div className="w-9 h-9 rounded-full bg-ink/10 animate-pulse shrink-0" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-12 rounded bg-ink/8 animate-pulse" />
                  <div className="h-3 w-28 rounded bg-ink/8 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
          {/* Offers skeleton */}
          <div className="space-y-2">
            {[0,1,2].map(i => (
              <div key={i} className="border border-ink/10 rounded-lg px-4 py-3.5 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-ink/10 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded bg-ink/8 animate-pulse" style={{ width: `${50 + i * 15}%` }} />
                  <div className="h-2.5 w-24 rounded bg-ink/8 animate-pulse" />
                </div>
                <div className="h-7 w-16 rounded bg-ink/8 animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        </div>
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
