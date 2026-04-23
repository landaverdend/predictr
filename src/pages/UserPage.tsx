import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useProfiles } from '../hooks/useProfiles'
import { parseMarket, parseOffer, computeStats, takerStake, tag, truncate, timeAgo } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import { KIND_MARKET_ANNOUNCEMENT, KIND_OFFER } from '../lib/kinds'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-ink/30 hover:text-ink/60 border border-ink/10 rounded px-1.5 py-0.5 transition-colors shrink-0"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 bg-elevated rounded-xl px-4 py-3 text-center">
      <p className="text-[11px] text-ink/30 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-mono font-semibold ${accent ? 'text-positive' : ''}`}>{value}</p>
    </div>
  )
}

function OfferRow({ offer }: { offer: Offer }) {
  const ts = takerStake(offer)
  const isOpen = offer.status === 'open'
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-ink/5 last:border-0">
      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${offer.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
        {offer.side}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-ink/70">
          {offer.makerStake.toLocaleString()} sats @ {offer.confidence}% confidence
        </p>
        <p className="text-[11px] text-ink/30 mt-0.5">
          pot {(offer.makerStake + ts).toLocaleString()} sats · taker puts {ts.toLocaleString()}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[11px] font-medium ${isOpen ? 'text-positive/70' : 'text-ink/30'}`}>{offer.status}</p>
        <p className="text-[10px] text-ink/25 mt-0.5">{timeAgo(offer.createdAt)}</p>
      </div>
    </div>
  )
}

function MarketRow({ market, offers, onClick }: { market: Market; offers: Offer[]; onClick: () => void }) {
  const stats = computeStats(offers)
  const total = stats.yesVolume + stats.noVolume
  const yesPct = total > 0 ? Math.round(stats.yesVolume / total * 100) : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-ink/5 last:border-0 hover:bg-ink/3 transition-colors"
    >
      <p className="text-sm font-medium leading-snug mb-2">{market.question}</p>
      {yesPct !== null && (
        <div className="mb-2 space-y-1">
          <div className="flex h-1 rounded-full overflow-hidden">
            <div className="bg-positive/50" style={{ width: `${yesPct}%` }} />
            <div className="bg-negative/50 flex-1" />
          </div>
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-positive/70">YES {yesPct}%</span>
            <span className="text-negative/70">{100 - yesPct}% NO</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-ink/30">
        <span>resolves block {market.resolutionBlockheight.toLocaleString()}</span>
        <span>{stats.openCount} open · {stats.filledCount} filled</span>
      </div>
    </button>
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
      [{ kinds: [KIND_MARKET_ANNOUNCEMENT, KIND_OFFER], authors: [pubkey] }],
      (event: NostrEvent) => {
        if (event.kind === KIND_MARKET_ANNOUNCEMENT) {
          const market = parseMarket(event)
          setMarkets(prev => ({ ...prev, [market.id]: market }))
        } else if (event.kind === KIND_OFFER) {
          const offer = parseOffer(event)
          const marketId = tag(event, 'm') || tag(event, 'market_id')
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
  const hasActivity = marketList.length > 0 || userOffers.length > 0

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto pb-16">
      {/* Banner */}
      <div className="relative h-32 bg-gradient-to-br from-brand/20 via-brand/5 to-transparent overflow-hidden">
        {profile?.banner && (
          <img
            src={profile.banner}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 flex items-center gap-1.5 text-xs text-white/70 hover:text-white bg-black/20 backdrop-blur-sm rounded-lg px-3 py-1.5 transition-colors"
        >
          ← back
        </button>
      </div>

      {/* Profile header */}
      <div className="px-6">
        <div className="flex items-end justify-between -mt-8 mb-4">
          <div className="w-16 h-16 rounded-2xl ring-4 ring-surface overflow-hidden bg-elevated shrink-0">
            {profile?.picture ? (
              <img
                src={profile.picture}
                alt={profile.name ?? pubkey.slice(0, 8)}
                className="w-full h-full object-cover"
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand/10">
                <span className="text-lg font-mono text-brand">{pubkey.slice(0, 2)}</span>
              </div>
            )}
          </div>
          {profile?.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ink/40 hover:text-ink/70 border border-ink/10 rounded-lg px-3 py-1.5 transition-colors"
            >
              website ↗
            </a>
          )}
        </div>

        <div className="space-y-1 mb-5">
          {profile?.name ? (
            <h1 className="text-xl font-bold">{profile.name}</h1>
          ) : (
            <h1 className="text-xl font-bold text-ink/30 font-mono">{truncate(pubkey)}</h1>
          )}
          {profile?.about && (
            <p className="text-sm text-ink/50 leading-relaxed">{profile.about}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <p className="text-[11px] font-mono text-ink/25 truncate">{pubkey}</p>
            <CopyButton text={pubkey} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-8">
          <StatCard label="open offers" value={String(openOffers.length)} />
          <StatCard label="filled" value={String(filledOffers.length)} />
          <StatCard label="volume" value={totalVolume > 0 ? `${totalVolume.toLocaleString()} sats` : '—'} accent={totalVolume > 0} />
        </div>

        {/* Oracle markets */}
        {marketList.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs text-ink/30 uppercase tracking-wider font-medium mb-3">oracle markets</h2>
            <div className="border border-ink/10 rounded-xl overflow-hidden">
              {marketList.map(m => (
                <MarketRow
                  key={m.id}
                  market={m}
                  offers={offersByMarket[m.id] ?? []}
                  onClick={() => navigate(`/markets/${m.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Their offers */}
        {userOffers.length > 0 && (
          <section>
            <h2 className="text-xs text-ink/30 uppercase tracking-wider font-medium mb-3">offers</h2>
            <div className="border border-ink/10 rounded-xl overflow-hidden">
              {userOffers.map(o => <OfferRow key={o.id} offer={o} />)}
            </div>
          </section>
        )}

        {!hasActivity && (
          <div className="text-center text-ink/25 text-sm py-20">no activity found</div>
        )}
      </div>
    </main>
  )
}
