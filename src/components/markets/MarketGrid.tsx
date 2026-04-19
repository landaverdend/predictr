import type { Market } from '../../lib/market'
import { truncate } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'
import { Avatar } from '../Avatar'

function MarketCard({ market, onSelect }: { market: Market; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="text-left border border-ink/10 rounded-lg overflow-hidden hover:border-ink/25 transition-colors"
    >
      <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
      <div className="p-5 space-y-4">
        <p className="text-sm font-medium leading-snug">{market.question}</p>
        <div className="flex items-center gap-2">
          <Avatar pubkey={market.pubkey} size="sm" />
          <span className="text-xs text-ink/30 font-mono">{truncate(market.pubkey)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-ink/30 pt-1 border-t border-ink/5">
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
