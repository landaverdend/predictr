import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useProfiles } from '../hooks/useProfiles'
import { parseMarket, parseOffer, computeStats, takerStake, tag, truncate, timeAgo } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import { Avatar } from '../components/Avatar'

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink/5 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-ink/30 mb-1">{label}</p>
      <p className="text-sm font-mono font-medium">{value}</p>
    </div>
  )
}

function OfferRow({ offer }: { offer: Offer }) {
  const ts = takerStake(offer)
  return (
    <div className="border border-ink/10 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${offer.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {offer.side}
        </span>
        <div>
          <p className="text-xs font-mono">{offer.makerStake.toLocaleString()} sats · {offer.confidence}% confidence</p>
          <p className="text-[11px] text-ink/30 mt-0.5">{ts.toLocaleString()} sats to take · pot {(offer.makerStake + ts).toLocaleString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink/30">
        <span className={offer.status === 'filled' ? 'text-ink/40' : 'text-positive/70'}>{offer.status}</span>
        <span>{timeAgo(offer.createdAt)}</span>
      </div>
    </div>
  )
}

function MarketRow({ market, offers }: { market: Market; offers: Offer[] }) {
  const stats = computeStats(offers)
  const hasVolume = stats.yesVolume > 0 || stats.noVolume > 0
  const total = stats.yesVolume + stats.noVolume
  const yesPct = hasVolume ? Math.round(stats.yesVolume / total * 100) : null

  return (
    <div className="border border-ink/10 rounded-lg px-4 py-3 space-y-2">
      <p className="text-sm font-medium leading-snug">{market.question}</p>
      <div className="flex items-center justify-between text-xs text-ink/30">
        <span>block {market.resolutionBlockheight.toLocaleString()}</span>
        <div className="flex items-center gap-3">
          {stats.totalVolume > 0 && <span className="font-mono">{stats.totalVolume.toLocaleString()} sats vol</span>}
          <span>{stats.openCount} open · {stats.filledCount} filled</span>
        </div>
      </div>
      {yesPct !== null && (
        <div className="space-y-1">
          <div className="flex h-1 rounded-full overflow-hidden">
            <div className="bg-positive/50" style={{ width: `${yesPct}%` }} />
            <div className="bg-negative/50 flex-1" />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-ink/30">
            <span>YES {yesPct}%</span>
            <span>{100 - yesPct}% NO</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function UserPage() {
  const { pubkey } = useParams<{ pubkey: string }>()
  const navigate = useNavigate()
  const { subscribe } = useRelayContext()
  const profiles = useProfiles(pubkey ? [pubkey] : [])
  const profile = pubkey ? profiles.get(pubkey) : undefined

  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [offersByMarket, setOffersByMarket] = useState<Record<string, Offer[]>>({})
  const [userOffers, setUserOffers] = useState<Offer[]>([])

  useEffect(() => {
    if (!pubkey) return

    const unsub = subscribe(
      `user-page:${pubkey}`,
      [{ kinds: [8050, 30051], authors: [pubkey] }],
      (event: NostrEvent) => {
        if (event.kind === 8050) {
          const market = parseMarket(event)
          setMarkets(prev => ({ ...prev, [market.id]: market }))
        } else if (event.kind === 30051) {
          const offer = parseOffer(event)
          const marketId = tag(event, 'market_id')
          setUserOffers(prev => {
            const idx = prev.findIndex(o => o.id === offer.id)
            if (idx >= 0) { const u = [...prev]; u[idx] = offer; return u }
            return [...prev, offer]
          })
          setOffersByMarket(prev => {
            const existing = prev[marketId] ?? []
            const idx = existing.findIndex(o => o.id === offer.id)
            if (idx >= 0) { const u = [...existing]; u[idx] = offer; return { ...prev, [marketId]: u } }
            return { ...prev, [marketId]: [...existing, offer] }
          })
        }
      },
    )

    return unsub
  }, [pubkey, subscribe])

  if (!pubkey) return null

  const openOffers = userOffers.filter(o => o.status === 'open')
  const filledOffers = userOffers.filter(o => o.status !== 'open')
  const totalVolume = filledOffers.reduce((s, o) => s + o.makerStake + takerStake(o), 0)
  const marketList = Object.values(markets)

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full space-y-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
        <span>←</span> back
      </button>

      {/* Profile header */}
      <div className="flex items-center gap-5">
        <Avatar pubkey={pubkey} size="md" />
        <div className="min-w-0">
          {profile?.name && <p className="text-lg font-semibold">{profile.name}</p>}
          <p className="text-xs font-mono text-ink/40 break-all">{pubkey}</p>
          {profile?.about && <p className="text-sm text-ink/50 mt-1 leading-relaxed">{profile.about}</p>}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatPill label="open offers" value={String(openOffers.length)} />
        <StatPill label="filled offers" value={String(filledOffers.length)} />
        <StatPill label="volume" value={totalVolume > 0 ? `${totalVolume.toLocaleString()} sats` : '—'} />
      </div>

      {/* Oracle markets */}
      {marketList.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">oracle markets</h2>
          <div className="space-y-2">
            {marketList.map(m => (
              <MarketRow key={m.id} market={m} offers={offersByMarket[m.id] ?? []} />
            ))}
          </div>
        </section>
      )}

      {/* Their offers */}
      {userOffers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">offers</h2>
          <div className="space-y-2">
            {userOffers.map(o => <OfferRow key={o.id} offer={o} />)}
          </div>
        </section>
      )}

      {marketList.length === 0 && userOffers.length === 0 && (
        <div className="text-center text-ink/30 text-sm py-20">no activity found for this user</div>
      )}
    </main>
  )
}
