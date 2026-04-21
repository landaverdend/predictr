import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Market, Offer } from '../../lib/market'
import { takerStake, truncate, timeAgo, computeStats } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'
import { PlaceBetForm } from './PlaceBetForm'
import { TakeOfferModal } from './TakeOfferModal'
import { Avatar } from '../Avatar'

function OfferRow({ offer, onTake }: { offer: Offer; onTake: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="border border-ink/10 rounded-lg px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded ${offer.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {offer.side}
        </span>
        <div>
          <p className="text-sm font-mono">{offer.makerStake.toLocaleString()} sats</p>
          <p className="text-xs text-ink/30 mt-0.5">
            {offer.confidence}% confidence · {takerStake(offer).toLocaleString()} to take
          </p>
        </div>
      </div>
      <div className="flex items-center gap-5 text-xs text-ink/30">
        <button
          onClick={() => navigate(`/user/${offer.makerPubkey}`)}
          className="font-mono hidden sm:block hover:text-ink/60 transition-colors"
        >
          {truncate(offer.makerPubkey)}
        </button>
        <span>{timeAgo(offer.createdAt)}</span>
        {offer.status === 'filled' ? (
          <span className="text-xs text-ink/20 px-3 py-1.5">filled</span>
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

export function MarketDetail({ market, offers, onBack }: { market: Market; offers: Offer[]; onBack: () => void }) {
  const [placing, setPlacing] = useState(false)
  const [taking, setTaking] = useState<Offer | null>(null)
  const navigate = useNavigate()
  const stats = computeStats(offers)
  const hasVolume = stats.yesVolume > 0 || stats.noVolume > 0
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

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">open offers</h3>
          <button
            onClick={() => setPlacing(true)}
            className="text-xs border border-ink/20 rounded px-3 py-1.5 hover:bg-ink/5 transition-colors"
          >
            place bet
          </button>
        </div>

        {offers.length === 0 ? (
          <div className="border border-ink/10 rounded-lg p-12 text-center text-ink/30 text-sm">
            no offers yet — be the first
          </div>
        ) : (
          <div className="space-y-2">
            {offers.map(offer => (
              <OfferRow key={offer.id} offer={offer} onTake={() => setTaking(offer)} />
            ))}
          </div>
        )}
      </div>

      {placing && <PlaceBetForm market={market} onDone={() => setPlacing(false)} />}
      {taking && <TakeOfferModal market={market} offer={taking} onDone={() => setTaking(null)} />}
    </div>
  )
}
