import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Market, Offer } from '../../lib/market'
import type { Resolution } from '../../pages/MarketsPage'
import { takerStake, truncate, timeAgo, computeStats } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'
import { PlaceBetForm } from './PlaceBetForm'
import { TakeOfferModal } from './TakeOfferModal'
import { Avatar } from '../Avatar'
import { Input } from '../Input'
import { useProfiles, type NostrProfile } from '../../hooks/useProfiles'

function OfferRow({ offer, profile, onTake }: { offer: Offer; profile: NostrProfile | undefined; onTake: () => void }) {
  const navigate = useNavigate()
  const displayName = profile?.name ?? truncate(offer.makerPubkey)

  return (
    <div className="border border-ink/10 rounded-lg px-4 py-3.5 flex items-center gap-4">
      {/* Maker identity */}
      <button
        onClick={() => navigate(`/user/${offer.makerPubkey}`)}
        className="flex items-center gap-2.5 shrink-0 hover:opacity-75 transition-opacity"
      >
        <Avatar pubkey={offer.makerPubkey} size="md" />
        <div className="text-left hidden sm:block">
          <p className="text-xs font-medium text-ink/80 leading-tight">{displayName}</p>
          <p className="text-[10px] font-mono text-ink/30 mt-0.5">{truncate(offer.makerPubkey)}</p>
        </div>
      </button>

      {/* Bet details */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${offer.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {offer.side}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium">{offer.makerStake.toLocaleString()} sats</p>
          <p className="text-[11px] text-ink/30 mt-0.5 truncate">
            {offer.confidence}% conf · {takerStake(offer).toLocaleString()} to take
          </p>
        </div>
      </div>

      {/* Time + action */}
      <div className="flex items-center gap-3 shrink-0 text-xs text-ink/30">
        <span className="hidden sm:block">{timeAgo(offer.createdAt)}</span>
        {offer.status === 'filled' ? (
          <span className="text-ink/20 px-3 py-1.5">filled</span>
        ) : (
          <button
            onClick={onTake}
            className="border border-ink/20 rounded px-3 py-1.5 hover:bg-ink/5 transition-colors text-ink/60"
          >
            take
          </button>
        )}
      </div>
    </div>
  )
}

type StatusFilter = 'all' | 'open' | 'filled'

export function MarketDetail({ market, offers, resolution, blockHeight, onBack }: {
  market: Market
  offers: Offer[]
  resolution: Resolution | undefined
  blockHeight: number | null
  onBack: () => void
}) {
  const [placing, setPlacing] = useState(false)
  const [taking, setTaking] = useState<Offer | null>(null)
  const navigate = useNavigate()

  const makerPubkeys = useMemo(
    () => [...new Set(offers.map(o => o.makerPubkey))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offers.map(o => o.makerPubkey).join(',')],
  )
  const profiles = useProfiles(makerPubkeys)

  // filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [minSats, setMinSats] = useState('')
  const [maxSats, setMaxSats] = useState('')
  const [minConf, setMinConf] = useState('')
  const [maxConf, setMaxConf] = useState('')

  const filteredOffers = offers.filter(o => {
    if (statusFilter === 'open' && o.status !== 'open') return false
    if (statusFilter === 'filled' && o.status === 'open') return false
    if (minSats && o.makerStake < parseInt(minSats)) return false
    if (maxSats && o.makerStake > parseInt(maxSats)) return false
    if (minConf && o.confidence < parseInt(minConf)) return false
    if (maxConf && o.confidence > parseInt(maxConf)) return false
    return true
  })

  const stats = computeStats(offers)
  const hasVolume = stats.yesVolume > 0 || stats.noVolume > 0
  const isPastDeadline = blockHeight !== null && blockHeight >= market.resolutionBlockheight
  const isClosed = !!resolution || isPastDeadline
  const total = stats.yesVolume + stats.noVolume
  const yesPct = hasVolume ? Math.round(stats.yesVolume / total * 100) : 50
  const noPct = 100 - yesPct

  return (
    <div className="space-y-8">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
        <span>←</span> all markets
      </button>

      <div className="border border-ink/10 rounded-lg overflow-hidden">
        <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
        <div className="p-6 space-y-5">
          <h2 className="text-lg font-semibold leading-snug">{market.question}</h2>
          {market.description && (
            <p className="text-sm text-ink/50 leading-relaxed">{market.description}</p>
          )}

          {hasVolume && (
            <div className="space-y-2">
              <div className="flex h-2 rounded-full overflow-hidden">
                <div className="bg-positive/60 transition-all duration-500" style={{ width: `${yesPct}%` }} />
                <div className="bg-negative/60 flex-1" />
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-positive">YES {yesPct}%</span>
                <span className="text-negative">{noPct}% NO</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-ink/5 rounded-lg px-3 py-3">
              <p className="text-xs text-ink/30 mb-1">open offers</p>
              <p className="text-sm font-mono font-medium">{stats.openCount}</p>
            </div>
            <div className="bg-ink/5 rounded-lg px-3 py-3">
              <p className="text-xs text-ink/30 mb-1">filled</p>
              <p className="text-sm font-mono font-medium">{stats.filledCount}</p>
            </div>
            <div className="bg-ink/5 rounded-lg px-3 py-3">
              <p className="text-xs text-ink/30 mb-1">volume</p>
              <p className="text-sm font-mono font-medium">{stats.totalVolume > 0 ? `${stats.totalVolume.toLocaleString()}` : '—'}</p>
              {stats.totalVolume > 0 && <p className="text-[10px] text-ink/30">sats</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-ink/5">
            <button onClick={() => navigate(`/user/${market.pubkey}`)} className="flex items-center gap-3 hover:opacity-75 transition-opacity">
              <Avatar pubkey={market.pubkey} size="md" />
              <div className="text-left">
                <p className="text-xs text-ink/30">oracle</p>
                <p className="text-xs font-mono text-ink/60 mt-0.5">{truncate(market.pubkey)}</p>
              </div>
            </button>
            <div className="ml-auto text-right">
              <p className="text-xs text-ink/30">resolves at</p>
              <p className="text-xs font-mono text-ink/60 mt-0.5">block {market.resolutionBlockheight.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {resolution && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium border ${resolution.outcome === 'YES' ? 'bg-positive/10 border-positive/20 text-positive' : 'bg-negative/10 border-negative/20 text-negative'}`}>
          resolved: <span className="font-bold">{resolution.outcome}</span>
          <p className="text-[11px] font-mono font-normal mt-1 opacity-60 break-all">preimage: {resolution.preimage}</p>
        </div>
      )}
      {!resolution && isPastDeadline && (
        <div className="rounded-lg px-4 py-3 text-sm bg-ink/5 border border-ink/10 text-ink/50">
          past resolution block — awaiting oracle reveal
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">offers</h3>
          {!isClosed && (
            <button
              onClick={() => setPlacing(true)}
              className="text-xs border border-ink/20 rounded px-3 py-1.5 hover:bg-ink/5 transition-colors"
            >
              place bet
            </button>
          )}
        </div>

        {/* Filters */}
        {offers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Status toggle */}
            <div className="flex rounded-lg border border-ink/10 overflow-hidden text-xs">
              {(['all', 'open', 'filled'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 transition-colors ${statusFilter === s ? 'bg-ink/10 text-ink/80' : 'text-ink/30 hover:text-ink/60'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Sats range */}
            <div className="flex items-center border border-ink/10 rounded-lg overflow-hidden text-xs">
              <span className="px-3 py-1.5 text-ink/30 border-r border-ink/10 bg-ink/3 select-none">sats</span>
              <input
                type="number"
                placeholder="min"
                value={minSats}
                onChange={e => setMinSats(e.target.value)}
                className="w-16 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-ink/20 px-0.5">–</span>
              <input
                type="number"
                placeholder="max"
                value={maxSats}
                onChange={e => setMaxSats(e.target.value)}
                className="w-16 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Confidence range */}
            <div className="flex items-center border border-ink/10 rounded-lg overflow-hidden text-xs">
              <span className="px-3 py-1.5 text-ink/30 border-r border-ink/10 bg-ink/3 select-none">conf</span>
              <input
                type="number"
                min="1" max="99"
                placeholder="min"
                value={minConf}
                onChange={e => setMinConf(e.target.value)}
                className="w-12 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-ink/20 px-0.5">–</span>
              <input
                type="number"
                min="1" max="99"
                placeholder="max"
                value={maxConf}
                onChange={e => setMaxConf(e.target.value)}
                className="w-12 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="pr-3 text-ink/30">%</span>
            </div>

            {(statusFilter !== 'all' || minSats || maxSats || minConf || maxConf) && (
              <button
                onClick={() => { setStatusFilter('all'); setMinSats(''); setMaxSats(''); setMinConf(''); setMaxConf('') }}
                className="text-xs text-ink/30 hover:text-ink/60 transition-colors"
              >
                clear
              </button>
            )}
          </div>
        )}

        {offers.length === 0 ? (
          <div className="border border-ink/10 rounded-lg p-12 text-center text-ink/30 text-sm">
            no offers yet — be the first
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="border border-ink/10 rounded-lg p-8 text-center text-ink/30 text-sm">
            no offers match filters
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOffers.map(offer => (
              <OfferRow key={offer.id} offer={offer} profile={profiles.get(offer.makerPubkey)} onTake={() => setTaking(offer)} />
            ))}
          </div>
        )}
      </div>

      {placing && <PlaceBetForm market={market} onDone={() => setPlacing(false)} />}
      {taking && <TakeOfferModal market={market} offer={taking} onDone={() => setTaking(null)} />}
    </div>
  )
}
