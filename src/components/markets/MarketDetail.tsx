import { useState } from 'react'
import type { Market, Offer } from '../../lib/market'
import { takerStake, truncate, timeAgo } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'
import { PlaceBetForm } from './PlaceBetForm'
import { TakeOfferModal } from './TakeOfferModal'
import { Avatar } from '../Avatar'

function OfferRow({ offer, onTake }: { offer: Offer; onTake: () => void }) {
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
        <span className="font-mono hidden sm:block">{truncate(offer.makerPubkey)}</span>
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
          <div className="flex items-center gap-4 pt-2 border-t border-ink/5">
            <Avatar pubkey={market.pubkey} size="md" />
            <div>
              <p className="text-xs text-ink/30">oracle</p>
              <p className="text-xs font-mono text-ink/60 mt-0.5">{truncate(market.pubkey)}</p>
            </div>
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
