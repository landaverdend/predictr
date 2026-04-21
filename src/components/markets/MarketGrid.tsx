import { useNavigate } from 'react-router-dom'
import type { Market, Offer } from '../../lib/market'
import { truncate, computeStats } from '../../lib/market'
import { ImagePlaceholder } from './ImagePlaceholder'
import { Avatar } from '../Avatar'

function MarketCard({ market, offers, onSelect }: { market: Market; offers: Offer[]; onSelect: () => void }) {
  const navigate = useNavigate()
  const stats = computeStats(offers)

  return (
    <button
      onClick={onSelect}
      className="text-left border border-ink/10 rounded-lg overflow-hidden hover:border-ink/25 transition-colors"
    >
      <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
      <div className="p-5 space-y-4">
        <p className="text-sm font-medium leading-snug">{market.question}</p>
        <button
          onClick={e => { e.stopPropagation(); navigate(`/user/${market.pubkey}`) }}
          className="flex items-center gap-2 hover:opacity-75 transition-opacity"
        >
          <Avatar pubkey={market.pubkey} size="sm" />
          <span className="text-xs text-ink/30 font-mono">{truncate(market.pubkey)}</span>
        </button>
        <div className="pt-1 border-t border-ink/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-ink/30">
            <span>block {market.resolutionBlockheight.toLocaleString()}</span>
            <div className="flex items-center gap-2">
              {stats.filledCount > 0 && (
                <span className="font-mono text-ink/40">{stats.totalVolume.toLocaleString()} sats</span>
              )}
              <span>{stats.openCount} open</span>
            </div>
          </div>
          {(stats.yesVolume > 0 || stats.noVolume > 0) && (() => {
            const total = stats.yesVolume + stats.noVolume
            const yesPct = Math.round(stats.yesVolume / total * 100)
            const noPct = 100 - yesPct
            return (
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden">
                  <div className="bg-positive/60" style={{ width: `${yesPct}%` }} />
                  <div className="bg-negative/60 flex-1" />
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-positive/70">YES {yesPct}%</span>
                  <span className="text-negative/70">{noPct}% NO</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </button>
  )
}

export function MarketGrid({ markets, offers, onSelect }: { markets: Market[]; offers: Record<string, Offer[]>; onSelect: (m: Market) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {markets.map(market => (
        <MarketCard key={market.id} market={market} offers={offers[market.id] ?? []} onSelect={() => onSelect(market)} />
      ))}
    </div>
  )
}
