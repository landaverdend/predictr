import { useNavigate } from 'react-router-dom'
import type { Market, Offer } from '../../lib/market'
import type { Resolution } from '../../pages/MarketsPage'
import { truncate, computeStats } from '../../lib/market'
import { projectedResolution } from '../../lib/blocktime'
import { ImagePlaceholder } from './ImagePlaceholder'
import { Avatar } from '../Avatar'
import { useLang } from '../../context/LangContext'

/** Compact pill shown on the card — just the relative time, hover for more */
function ResolutionPill({ resolutionBlock, currentBlock }: { resolutionBlock: number; currentBlock: number | null }) {
  const info = projectedResolution(resolutionBlock, currentBlock)
  if (!info) return (
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-ink/8 border border-ink/10 text-ink/40 whitespace-nowrap">
      block {resolutionBlock.toLocaleString()}
    </span>
  )
  return (
    <span
      className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-ink/8 border border-ink/10 text-ink/40 whitespace-nowrap"
      title={`block ${resolutionBlock.toLocaleString()} · ${info.absolute} (rough estimate)`}
    >
      {info.relative === 'resolved' ? 'resolved' : `resolves ${info.relative}`}
    </span>
  )
}

function MarketCard({ market, offers, resolution, blockHeight, onSelect }: {
  market: Market
  offers: Offer[]
  resolution: Resolution | undefined
  blockHeight: number | null
  onSelect: () => void
}) {
  const navigate = useNavigate()
  const { t } = useLang()
  const stats = computeStats(offers, [])
  const isPastDeadline = blockHeight !== null && blockHeight >= market.resolutionBlockheight
  const isResolved = !!resolution
  const isClosed = isResolved || isPastDeadline

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      className="text-left border border-ink/10 rounded-lg overflow-hidden hover:border-ink/25 transition-colors cursor-pointer"
    >
      <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-2">
          <p className="text-sm font-medium leading-snug flex-1">{market.question}</p>
          {isResolved && (
            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded ${resolution!.outcome === 'YES' ? 'bg-positive/20 text-positive border border-positive/30' : 'bg-negative/20 text-negative border border-negative/30'}`}>
              {t('card.resolved')} {resolution!.outcome}
            </span>
          )}
          {!isResolved && isPastDeadline && (
            <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded bg-ink/40 text-white/70">{t('card.pending')}</span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); navigate(`/user/${market.pubkey}`) }}
          className="flex items-center gap-2 hover:opacity-75 transition-opacity"
        >
          <Avatar pubkey={market.pubkey} size="sm" />
          <span className="text-xs text-ink/30 font-mono">{truncate(market.pubkey)}</span>
        </button>
        <div className="pt-1 border-t border-ink/5 space-y-3">
          <div className="flex items-center justify-between text-xs text-ink/30">
            <div className="flex items-center gap-2">
              {stats.filledCount > 0 && (
                <span className="font-mono text-ink/40">{stats.totalVolume.toLocaleString()} sats</span>
              )}
              <span>{stats.openCount} {t('card.open')}</span>
            </div>
          </div>
          <ResolutionPill resolutionBlock={market.resolutionBlockheight} currentBlock={blockHeight} />
          {(stats.yesVolume > 0 || stats.noVolume > 0) && (() => {
            const total = stats.yesVolume + stats.noVolume
            const yesPct = Math.round(stats.yesVolume / total * 100)
            const noPct = 100 - yesPct
            return (
              <div className="space-y-1 mt-2">
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
    </div>
  )
}

export function MarketCardSkeleton() {
  return (
    <div className="border border-ink/10 rounded-lg overflow-hidden">
      {/* Image */}
      <div className="w-full h-40 bg-gradient-to-r from-ink/5 via-ink/10 to-ink/5 bg-[length:200%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]" />
      <div className="p-5 space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <div className="h-3.5 rounded bg-ink/8 animate-pulse w-full" />
          <div className="h-3.5 rounded bg-ink/8 animate-pulse w-3/4" />
        </div>
        {/* Avatar + name */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-ink/10 animate-pulse shrink-0" />
          <div className="h-2.5 w-24 rounded bg-ink/8 animate-pulse" />
        </div>
        {/* Footer */}
        <div className="pt-1 border-t border-ink/5 space-y-3">
          <div className="h-2.5 w-20 rounded bg-ink/8 animate-pulse" />
          <div className="h-5 w-28 rounded-full bg-ink/8 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function MarketGrid({ markets, offers, resolutions, blockHeight, onSelect }: {
  markets: Market[]
  offers: Record<string, Offer[]>
  resolutions: Record<string, Resolution>
  blockHeight: number | null
  onSelect: (m: Market) => void
}) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {markets.map(market => (
        <MarketCard
          key={market.id}
          market={market}
          offers={offers[market.id] ?? []}
          resolution={resolutions[market.id]}
          blockHeight={blockHeight}
          onSelect={() => onSelect(market)}
        />
      ))}
    </div>
  )
}
