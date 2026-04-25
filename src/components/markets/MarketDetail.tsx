import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import type { Market, Offer, Fill } from '../../lib/market'
import type { Resolution } from '../../pages/MarketsPage'
import { takerStake, truncate, timeAgo, computeStats } from '../../lib/market'
import { BlocktimeLabel } from '../BlocktimeLabel'
import { ImagePlaceholder } from './ImagePlaceholder'
import { PlaceBetForm } from './PlaceBetForm'
import { TakeOfferModal } from './TakeOfferModal'
import { Avatar } from '../Avatar'
import { useProfiles, type NostrProfile } from '../../hooks/useProfiles'
import { useLang } from '../../context/LangContext'

function formatSats(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return n.toLocaleString()
}

function CopyShareButton({ offer }: { offer: Offer }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    const url = `${window.location.origin}/offer/${offer.makerPubkey}/${offer.id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="copy offer link"
      className={`shrink-0 transition-colors ${copied ? 'text-positive' : 'text-ink/20 hover:text-ink/50'}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      )}
    </button>
  )
}

function OfferRow({ offer, profile, onTake }: { offer: Offer; profile: NostrProfile | undefined; onTake: () => void }) {
  const navigate = useNavigate()
  const { t } = useLang()
  const displayName = profile?.name ?? truncate(offer.makerPubkey)

  return (
    <div
      onClick={() => navigate(`/offer/${offer.makerPubkey}/${offer.id}`)}
      className="border border-ink/10 rounded-lg px-4 py-3.5 flex items-center gap-4 cursor-pointer hover:border-ink/25 hover:bg-ink/[0.02] transition-colors"
    >
      <button
        onClick={e => { e.stopPropagation(); navigate(`/user/${offer.makerPubkey}`) }}
        className="flex items-center gap-2.5 shrink-0 hover:opacity-75 transition-opacity"
      >
        <Avatar pubkey={offer.makerPubkey} size="md" />
        <div className="text-left hidden sm:block">
          <p className="text-xs font-medium text-ink/80 leading-tight">{displayName}</p>
          <p className="text-[10px] font-mono text-ink/30 mt-0.5">{truncate(offer.makerPubkey)}</p>
        </div>
      </button>

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${offer.side === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {offer.side}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium">{offer.makerStake.toLocaleString()} sats</p>
          <p className="text-[11px] text-ink/30 mt-0.5 truncate">
            {offer.confidence}% {t('detail.conf')} · {takerStake(offer).toLocaleString()} {t('detail.to_take')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-xs text-ink/30">
        <span className="hidden sm:block">{timeAgo(offer.createdAt)}</span>
        <CopyShareButton offer={offer} />
        {offer.status === 'closed' ? (
          <span className="text-ink/20 px-3 py-1.5">{t('status.closed')}</span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onTake() }}
            className="border border-ink/20 rounded px-3 py-1.5 hover:bg-ink/5 transition-colors text-ink/60"
          >
            {t('detail.offer_take')}
          </button>
        )}
      </div>
    </div>
  )
}

function FillRow({ fill }: { fill: Fill }) {
  const navigate = useNavigate()
  return (
    <div className="border border-ink/10 rounded-lg px-4 py-3.5 flex items-center gap-4">
      <button
        onClick={() => navigate(`/user/${fill.takerPubkey}`)}
        className="flex items-center gap-2.5 shrink-0 hover:opacity-75 transition-opacity"
      >
        <Avatar pubkey={fill.takerPubkey} size="md" />
        <div className="text-left hidden sm:block">
          <p className="text-[10px] font-mono text-ink/30 mt-0.5">{truncate(fill.takerPubkey)}</p>
        </div>
      </button>

      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${fill.makerSide === 'YES' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'}`}>
          {fill.makerSide}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-mono font-medium">{(fill.makerStake + fill.takerStake).toLocaleString()} sats</p>
          <p className="text-[11px] text-ink/30 mt-0.5 truncate">
            maker {fill.makerStake.toLocaleString()} · taker {fill.takerStake.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-xs text-ink/30">
        <span className="hidden sm:block">{timeAgo(fill.createdAt)}</span>
        <a
          href={`https://mempool.space/tx/${fill.txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-ink/40 hover:text-ink/70 transition-colors"
          title={fill.txid}
        >
          {fill.txid.slice(0, 8)}…
        </a>
      </div>
    </div>
  )
}

type OfferTab = 'standing' | 'filled'
type StandingStatusFilter = 'open' | 'closed' | 'all'

export function MarketDetail({ market, offers, fills, resolution, blockHeight, onBack }: {
  market: Market
  offers: Offer[]
  fills: Fill[]
  resolution: Resolution | undefined
  blockHeight: number | null
  onBack: () => void
}) {
  const [placing, setPlacing] = useState<'YES' | 'NO' | null>(null)
  const [taking, setTaking] = useState<Offer | null>(null)
  const navigate = useNavigate()
  const { t } = useLang()

  const makerPubkeys = useMemo(
    () => [...new Set(offers.map(o => o.makerPubkey))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offers.map(o => o.makerPubkey).join(',')],
  )
  const profiles = useProfiles(makerPubkeys)

  const [offerTab, setOfferTab] = useState<OfferTab>('standing')
  const [standingStatus, setStandingStatus] = useState<StandingStatusFilter>('open')
  const [minSats, setMinSats] = useState('')
  const [maxSats, setMaxSats] = useState('')
  const [minConf, setMinConf] = useState('')
  const [maxConf, setMaxConf] = useState('')

  const filteredOffers = offers.filter(o => {
    if (standingStatus === 'open' && o.status !== 'open') return false
    if (standingStatus === 'closed' && o.status !== 'closed') return false
    if (minSats && o.makerStake < parseInt(minSats)) return false
    if (maxSats && o.makerStake > parseInt(maxSats)) return false
    if (minConf && o.confidence < parseInt(minConf)) return false
    if (maxConf && o.confidence > parseInt(maxConf)) return false
    return true
  })

  const stats = computeStats(offers, fills)
  const hasVolume = stats.yesVolume > 0 || stats.noVolume > 0
  const isPastDeadline = blockHeight !== null && blockHeight >= market.resolutionBlockheight
  const isClosed = !!resolution || isPastDeadline
  const total = stats.yesVolume + stats.noVolume
  const yesPct = hasVolume ? Math.round(stats.yesVolume / total * 100) : 50
  const noPct = 100 - yesPct

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
        {t('detail.back')}
      </button>

      <div className="border border-ink/10 rounded-xl overflow-hidden">
        <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} height="h-64" expandable />
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold leading-snug">{market.question}</h2>
            {market.description && (
              <div className="mt-2 text-sm text-ink/50" data-color-mode="dark">
                <MDEditor.Markdown source={market.description} style={{ background: 'transparent', color: 'inherit', fontSize: '0.875rem' }} />
              </div>
            )}
            {!isClosed && (
              <div className="flex flex-col gap-2 mt-5">
                <span className="text-xs uppercase tracking-widest text-ink/30 font-medium">{t('detail.place_bet')}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlacing('YES')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-positive/15 text-positive border border-positive/30 hover:bg-positive/25 transition-colors"
                  >YES</button>
                  <button
                    onClick={() => setPlacing('NO')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-negative/15 text-negative border border-negative/30 hover:bg-negative/25 transition-colors"
                  >NO</button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex h-2.5 rounded-full overflow-hidden bg-ink/5">
              <div className="bg-positive/70 transition-all duration-700" style={{ width: `${yesPct}%` }} />
              <div className="bg-negative/50 flex-1" />
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-positive font-medium">YES {yesPct}%</span>
              {!hasVolume && <span className="text-ink/25 text-[10px]">{t('detail.no_volume')}</span>}
              <span className="text-negative/80 font-medium">{noPct}% NO</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5">
              <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('detail.open_offers')}</p>
              <p className="text-lg font-mono font-semibold">{stats.openCount}</p>
            </div>
            <div className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5">
              <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('detail.filled')}</p>
              <p className="text-lg font-mono font-semibold">{stats.filledCount}</p>
            </div>
            <div className="bg-ink/5 border border-ink/8 rounded-xl pl-3 pr-4 py-3.5">
              <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('detail.volume')}</p>
              <p className="text-lg font-mono font-semibold leading-tight">
                {stats.totalVolume > 0 ? formatSats(stats.totalVolume) : '—'}
              </p>
              {stats.totalVolume > 0 && <p className="text-[10px] text-ink/30 mt-0.5">sats</p>}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-3 border-t border-ink/8">
            <button onClick={() => navigate(`/user/${market.pubkey}`)} className="flex items-center gap-3 hover:opacity-75 transition-opacity">
              <Avatar pubkey={market.pubkey} size="md" />
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-wider text-ink/30">{t('detail.oracle')}</p>
                <p className="text-xs font-mono text-ink/60 mt-0.5">{truncate(market.pubkey)}</p>
              </div>
            </button>
            <div className="ml-auto text-right">
              <p className="text-[10px] uppercase tracking-wider text-ink/30">{t('detail.resolves_at')}</p>
              <BlocktimeLabel
                resolutionBlock={market.resolutionBlockheight}
                currentBlock={blockHeight}
                className="text-xs text-ink/70 mt-0.5 flex-wrap"
              />
            </div>
          </div>
        </div>
      </div>

      {resolution && (
        <div className={`rounded-xl px-5 py-4 text-sm font-medium border ${resolution.outcome === 'YES' ? 'bg-positive/10 border-positive/20 text-positive' : 'bg-negative/10 border-negative/20 text-negative'}`}>
          {t('detail.resolved_prefix')} <span className="font-bold">{resolution.outcome}</span>
          <p className="text-[11px] font-mono font-normal mt-1 opacity-60 break-all">{t('detail.preimage')} {resolution.preimage}</p>
        </div>
      )}
      {!resolution && isPastDeadline && (
        <div className="rounded-xl px-5 py-4 text-sm bg-ink/5 border border-ink/10 text-ink/50">
          {t('detail.past_deadline')}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex rounded-lg border border-ink/10 overflow-hidden text-xs w-fit">
          <button
            onClick={() => setOfferTab('standing')}
            className={`px-4 py-2 transition-colors ${offerTab === 'standing' ? 'bg-ink/10 text-ink/80' : 'text-ink/30 hover:text-ink/60'}`}
          >
            {t('detail.standing')}
          </button>
          <button
            onClick={() => setOfferTab('filled')}
            className={`px-4 py-2 transition-colors ${offerTab === 'filled' ? 'bg-ink/10 text-ink/80' : 'text-ink/30 hover:text-ink/60'}`}
          >
            {t('detail.filled_tab')}
          </button>
        </div>

        {offerTab === 'standing' && (
          <>
            {offers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-ink/10 overflow-hidden text-xs">
                  {(['open', 'closed', 'all'] as StandingStatusFilter[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStandingStatus(s)}
                      className={`px-3 py-1.5 transition-colors ${standingStatus === s ? 'bg-ink/10 text-ink/80' : 'text-ink/30 hover:text-ink/60'}`}
                    >
                      {s === 'open' ? t('detail.filter_open') : s === 'closed' ? t('status.closed') : t('detail.filter_all')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center border border-ink/10 rounded-lg overflow-hidden text-xs">
                  <span className="px-3 py-1.5 text-ink/30 border-r border-ink/10 bg-ink/3 select-none">sats</span>
                  <input type="number" placeholder="min" value={minSats} onChange={e => setMinSats(e.target.value)}
                    className="w-16 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="text-ink/20 px-0.5">–</span>
                  <input type="number" placeholder="max" value={maxSats} onChange={e => setMaxSats(e.target.value)}
                    className="w-16 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>

                <div className="flex items-center border border-ink/10 rounded-lg overflow-hidden text-xs">
                  <span className="px-3 py-1.5 text-ink/30 border-r border-ink/10 bg-ink/3 select-none">conf</span>
                  <input type="number" min="1" max="99" placeholder="min" value={minConf} onChange={e => setMinConf(e.target.value)}
                    className="w-12 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="text-ink/20 px-0.5">–</span>
                  <input type="number" min="1" max="99" placeholder="max" value={maxConf} onChange={e => setMaxConf(e.target.value)}
                    className="w-12 bg-transparent px-2 py-1.5 font-mono text-ink/70 placeholder-ink/20 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <span className="pr-3 text-ink/30">%</span>
                </div>

                {(standingStatus !== 'open' || minSats || maxSats || minConf || maxConf) && (
                  <button
                    onClick={() => { setStandingStatus('open'); setMinSats(''); setMaxSats(''); setMinConf(''); setMaxConf('') }}
                    className="text-xs text-ink/30 hover:text-ink/60 transition-colors"
                  >
                    {t('detail.filter_clear')}
                  </button>
                )}
              </div>
            )}

            {offers.length === 0 ? (
              <div className="border border-ink/8 rounded-xl p-12 text-center space-y-3">
                <p className="text-ink/25 text-sm">{t('detail.no_offers')}</p>
                {!isClosed && (
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPlacing('YES')} className="px-5 py-2 rounded-lg text-sm font-semibold bg-positive/10 text-positive border border-positive/20 hover:bg-positive/20 transition-colors">YES</button>
                    <button onClick={() => setPlacing('NO')} className="px-5 py-2 rounded-lg text-sm font-semibold bg-negative/10 text-negative border border-negative/20 hover:bg-negative/20 transition-colors">NO</button>
                  </div>
                )}
              </div>
            ) : filteredOffers.length === 0 ? (
              <div className="border border-ink/8 rounded-xl p-8 text-center text-ink/30 text-sm">
                {t('detail.no_match')}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredOffers.map(offer => (
                  <OfferRow key={offer.id} offer={offer} profile={profiles.get(offer.makerPubkey)} onTake={() => setTaking(offer)} />
                ))}
              </div>
            )}
          </>
        )}

        {offerTab === 'filled' && (
          fills.length === 0 ? (
            <div className="border border-ink/8 rounded-xl p-12 text-center">
              <p className="text-ink/25 text-sm">{t('detail.no_offers')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {fills.map(fill => (
                <FillRow key={fill.txid} fill={fill} />
              ))}
            </div>
          )
        )}
      </div>

      {placing && <PlaceBetForm market={market} initialSide={placing} onDone={() => setPlacing(null)} />}
      {taking && <TakeOfferModal market={market} offer={taking} onDone={() => setTaking(null)} />}
    </div>
  )
}
