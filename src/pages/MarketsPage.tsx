import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext } from '../context/ElectrumContext'
import { useLang } from '../context/LangContext'
import { parseMarket, parseOffer, tag, isValidMarket } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import { MarketGrid } from '../components/markets/MarketGrid'
import { KIND_MARKET_ANNOUNCEMENT, KIND_OFFER, KIND_RESOLUTION } from '../lib/kinds'

export type Resolution = { outcome: 'YES' | 'NO'; preimage: string }

export default function MarketsPage() {
  const navigate = useNavigate()
  const { subscribe } = useRelayContext()
  const { blockHeight } = useElectrumContext()
  const { t } = useLang()
  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [offers, setOffers] = useState<Record<string, Offer[]>>({})
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})

  useEffect(() => {
    const unsub = subscribe(
      'markets-feed',
      [{ kinds: [KIND_MARKET_ANNOUNCEMENT, KIND_OFFER, KIND_RESOLUTION] }],
      (event: NostrEvent) => {
        if (event.kind === KIND_MARKET_ANNOUNCEMENT) {
          const market = parseMarket(event)
          if (!isValidMarket(market)) return
          setMarkets(prev => ({ ...prev, [market.id]: market }))
        } else if (event.kind === KIND_OFFER) {
          const offer = parseOffer(event)
          const marketId = tag(event, 'm') || tag(event, 'market_id')
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
        } else if (event.kind === KIND_RESOLUTION) {
          const marketId = tag(event, 'd')
          const outcome = tag(event, 'outcome') as 'YES' | 'NO'
          const preimage = tag(event, 'preimage')
          if (marketId && outcome) {
            setResolutions(prev => ({ ...prev, [marketId]: { outcome, preimage } }))
          }
        }
      },
    )
    return unsub
  }, [subscribe])

  return (
    <main className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
      <div className="mb-10">
        <h1 className="text-2xl font-bold mb-2">{t('markets.title')}</h1>
        <p className="text-ink/40 text-sm">{t('markets.subtitle')}</p>
      </div>
      {Object.values(markets).length === 0 ? (
        <div className="text-center text-ink/30 text-sm py-24">
          {t('markets.empty')}
        </div>
      ) : (
        <MarketGrid
          markets={Object.values(markets)}
          offers={offers}
          resolutions={resolutions}
          blockHeight={blockHeight}
          onSelect={m => navigate(`/markets/${m.id}`)}
        />
      )}
    </main>
  )
}
