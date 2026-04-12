import type { Market } from '../../lib/market'
import { truncate } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'

function MarketCard({ market, onSelect }: { market: Market; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="text-left border border-white/10 rounded-lg overflow-hidden hover:border-white/25 transition-colors"
    >
      <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
      <div className="p-5 space-y-4">
        <p className="text-sm font-medium leading-snug">{market.question}</p>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-[9px] text-white/40 font-mono">{market.pubkey.slice(0, 2)}</span>
          </div>
          <span className="text-xs text-white/30 font-mono">{truncate(market.pubkey)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-white/30 pt-1 border-t border-white/5">
          <span>block {market.resolutionBlockheight.toLocaleString()}</span>
          <span>{market.offerCount} {market.offerCount === 1 ? 'offer' : 'offers'}</span>
        </div>
      </div>
    </button>
  )
}

export function MarketGrid({ markets, onSelect }: { markets: Market[]; onSelect: (m: Market) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {markets.map(market => (
        <MarketCard key={market.id} market={market} onSelect={() => onSelect(market)} />
      ))}
    </div>
  )
}
