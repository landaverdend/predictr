import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext } from '../context/ElectrumContext'
import { useLang } from '../context/LangContext'
import { parseMarket, parseOffer, tag } from '../lib/market'
import type { Market, Offer } from '../lib/market'
import { takerStake, truncate } from '../lib/market'
import { KIND_MARKET_ANNOUNCEMENT, KIND_OFFER } from '../lib/kinds'
import { BlocktimeLabel } from '../components/BlocktimeLabel'
import { TakeOfferModal } from '../components/markets/TakeOfferModal'
import { Avatar } from '../components/Avatar'
import { useProfiles } from '../hooks/useProfiles'

export default function OfferPage() {
  const { pubkey, dTag } = useParams<{ pubkey: string; dTag: string }>()
  const navigate = useNavigate()
  const { subscribe } = useRelayContext()
  const { blockHeight } = useElectrumContext()

  const [offer, setOffer] = useState<Offer | null>(null)
  const [market, setMarket] = useState<Market | null>(null)
  const [taking, setTaking] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const { t } = useLang()
  const profiles = useProfiles(offer ? [offer.makerPubkey] : [])
  const makerProfile = offer ? profiles.get(offer.makerPubkey) : undefined

  // Fetch offer
  useEffect(() => {
    if (!pubkey || !dTag) return
    const timeout = setTimeout(() => setNotFound(true), 8000)
    const unsub = subscribe(
      `offer-page:${pubkey}:${dTag}`,
      [{ kinds: [KIND_OFFER], authors: [pubkey], '#d': [dTag] }],
      (event: NostrEvent) => {
        clearTimeout(timeout)
        setOffer(parseOffer(event))
      },
    )
    return () => { clearTimeout(timeout); unsub() }
  }, [pubkey, dTag, subscribe])

  // Fetch market once we have the offer's market ID
  useEffect(() => {
    if (!offer) return
    // market ID comes from the 'm' tag on the offer event — but we only have the parsed offer
    // re-subscribe with a broader filter to get the raw event and extract m tag
    const unsub = subscribe(
      `offer-market:${offer.id}`,
      [{ kinds: [KIND_OFFER], authors: [offer.makerPubkey], '#d': [offer.id] }],
      (event: NostrEvent) => {
        const marketId = tag(event, 'm') || tag(event, 'market_id')
        if (!marketId) return
        subscribe(
          `offer-market-detail:${marketId}`,
          [{ kinds: [KIND_MARKET_ANNOUNCEMENT], '#d': [marketId] }],
          (mEvent: NostrEvent) => setMarket(parseMarket(mEvent)),
        )
      },
    )
    return unsub
  }, [offer?.id, offer?.makerPubkey, subscribe])

  const isPastDeadline = market && blockHeight !== null && blockHeight >= market.resolutionBlockheight

  if (notFound && !offer) {
    return (
      <main className="flex-1 px-6 py-10 max-w-xl mx-auto w-full">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors mb-8">
          {t('offer.back')}
        </button>
        <div className="text-center text-ink/30 text-sm py-24">{t('offer.not_found')}</div>
      </main>
    )
  }

  if (!offer) {
    return (
      <main className="flex-1 px-6 py-10 max-w-xl mx-auto w-full">
        <div className="h-4 w-16 rounded bg-ink/8 animate-pulse mb-8" />
        <div className="border border-ink/10 rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <div className="h-5 rounded bg-ink/8 animate-pulse w-full" />
            <div className="h-5 rounded bg-ink/8 animate-pulse w-2/3" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-ink/10 animate-pulse shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-28 rounded bg-ink/8 animate-pulse" />
              <div className="h-2.5 w-20 rounded bg-ink/8 animate-pulse" />
            </div>
            <div className="h-8 w-12 rounded bg-ink/8 animate-pulse" />
          </div>
          <div className="h-10 rounded-xl bg-ink/8 animate-pulse w-full" />
        </div>
      </main>
    )
  }

  const tStake = takerStake(offer)
  const isFilled = offer.status !== 'open'

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10 max-w-xl mx-auto w-full space-y-4 sm:space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
        {t('offer.back')}
      </button>

      {/* Market context */}
      {market ? (
        <Link
          to={`/markets/${market.id}`}
          className="block border border-ink/10 rounded-xl px-5 py-4 hover:border-ink/25 transition-colors"
        >
          <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('offer.label_market')}</p>
          <p className="text-sm font-medium leading-snug">{market.question}</p>
          {blockHeight !== null && (
            <div className="mt-2">
              <BlocktimeLabel
                resolutionBlock={market.resolutionBlockheight}
                currentBlock={blockHeight}
                className="text-[11px] text-ink/40"
              />
            </div>
          )}
        </Link>
      ) : (
        <div className="border border-ink/10 rounded-xl px-5 py-4 space-y-2">
          <div className="h-2.5 w-16 rounded bg-ink/8 animate-pulse" />
          <div className="h-4 rounded bg-ink/8 animate-pulse w-full" />
          <div className="h-4 rounded bg-ink/8 animate-pulse w-2/3" />
        </div>
      )}

      {/* Offer card */}
      <div className="border border-ink/10 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-ink/30">{t('offer.label_offer')}</p>
          {isFilled && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-ink/10 text-ink/40">{t('offer.filled_badge')}</span>
          )}
        </div>

        {/* Maker */}
        <button
          onClick={() => navigate(`/user/${offer.makerPubkey}`)}
          className="flex flex-col items-center gap-2 w-full hover:opacity-75 transition-opacity"
        >
          <Avatar pubkey={offer.makerPubkey} size="xl" />
          <div className="text-center">
            {makerProfile?.name && <p className="text-base font-medium">{makerProfile.name}</p>}
            <p className="text-sm font-mono text-ink/40">{truncate(offer.makerPubkey)}</p>
          </div>
        </button>

        {/* Bet details */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('offer.label_side')}</p>
            <p className={`text-lg font-mono font-semibold ${offer.side === 'YES' ? 'text-positive' : 'text-negative'}`}>
              {offer.side}
            </p>
          </div>
          <div className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('offer.label_stake')}</p>
            <p className="text-lg font-mono font-semibold">{offer.makerStake.toLocaleString()}</p>
            <p className="text-[10px] text-ink/30 mt-0.5">sats</p>
          </div>
          <div className="bg-ink/5 border border-ink/8 rounded-xl px-3 py-3.5">
            <p className="text-[10px] uppercase tracking-wider text-ink/30 mb-1.5">{t('offer.label_conf')}</p>
            <p className="text-lg font-mono font-semibold">{offer.confidence}%</p>
          </div>
        </div>

        <div className="text-xs text-ink/30 text-center">
          {t('offer.requires_staking')} <span className="font-mono text-ink/60">{tStake.toLocaleString()} sats</span>
        </div>

        {/* Action */}
        {!isFilled && market && !isPastDeadline ? (
          <button
            onClick={() => setTaking(true)}
            className="w-full py-3 rounded-xl text-sm font-bold bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 transition-colors"
          >
            {t('offer.take')}
          </button>
        ) : isFilled ? (
          <div className="w-full py-3 rounded-xl text-sm text-center text-ink/30 bg-ink/5 border border-ink/8">
            {t('offer.has_been_filled')}
          </div>
        ) : isPastDeadline ? (
          <div className="w-full py-3 rounded-xl text-sm text-center text-ink/30 bg-ink/5 border border-ink/8">
            {t('offer.past_deadline')}
          </div>
        ) : (
          <div className="w-full py-3 rounded-xl text-sm text-center text-ink/20 bg-ink/3 border border-ink/5 animate-pulse">
            {t('offer.loading_market')}
          </div>
        )}

        {market && (
          <Link
            to={`/markets/${market.id}`}
            className="block text-center text-xs text-ink/30 hover:text-ink/60 transition-colors"
          >
            {t('offer.view_full_market')}
          </Link>
        )}
      </div>

      {taking && market && (
        <TakeOfferModal market={market} offer={offer} onDone={() => setTaking(false)} />
      )}
    </main>
  )
}
