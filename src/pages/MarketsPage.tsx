import { useEffect, useState } from 'react'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { parseMarket, parseOffer, computeStats, tag } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import { MarketGrid } from '../components/markets/MarketGrid'
import { MarketDetail } from '../components/markets/MarketDetail'

export default function MarketsPage() {
  const { subscribe } = useRelayContext()
  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [offers, setOffers] = useState<Record<string, Offer[]>>({})
  const [selected, setSelected] = useState<Market | null>(null)

  useEffect(() => {
    const unsub = subscribe(
      'markets-feed',
      [{ kinds: [8050, 30051] }],
      (event: NostrEvent) => {
        if (event.kind === 8050) {
          const market = parseMarket(event)
          setMarkets(prev => ({ ...prev, [market.id]: market }))
        } else if (event.kind === 30051) {
          const offer = parseOffer(event)
          const marketId = tag(event, 'market_id')
          setOffers(prev => {
            const existing = prev[marketId] ?? []
            const idx = existing.findIndex(o => o.id === offer.id)
            if (idx >= 0) {
              const updated = [...existing]
              updated[idx] = offer
              return { ...prev, [marketId]: updated }
            }
            return { ...prev, [marketId]: [...existing, offer] }
          })
        }
      },
    )
    return unsub
  }, [subscribe])

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      {selected ? (
        <MarketDetail
          market={selected}
          offers={offers[selected.id] ?? []}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <div className="mb-10">
            <h1 className="text-2xl font-bold mb-2">markets</h1>
            <p className="text-ink/40 text-sm">open bets on nostr</p>
          </div>
          {Object.values(markets).length === 0 ? (
            <div className="text-center text-ink/30 text-sm py-24">
              no markets found on relay
            </div>
          ) : (
            <MarketGrid markets={Object.values(markets)} offers={offers} onSelect={setSelected} />
          )}
        </>
      )}
    </main>
  )
}
