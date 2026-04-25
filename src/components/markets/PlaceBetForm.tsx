import { useState } from 'react'
import type { Market } from '../../lib/market'
import { randomHex } from '../../lib/market'
import { KIND_OFFER } from '../../lib/kinds'
import { useRelayContext } from '../../context/RelayContext'
import { useLang } from '../../context/LangContext'
import { db } from '../../db'
import { toast } from 'sonner'

export function PlaceBetForm({ market, initialSide = 'YES', onDone }: { market: Market; initialSide?: 'YES' | 'NO'; onDone: () => void }) {
  const { publish } = useRelayContext()
  const { t } = useLang()
  const [side, setSide] = useState<'YES' | 'NO'>(initialSide)
  const [makerStake, setMakerStake] = useState('')
  const [confidence, setConfidence] = useState('50')

  const confidenceNum = Math.min(99, Math.max(1, parseInt(confidence) || 50))
  const makerStakeNum = parseInt(makerStake) || 0
  const impliedTakerStake = makerStakeNum > 0
    ? Math.ceil(makerStakeNum * (100 - confidenceNum) / confidenceNum)
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!window.nostr) {
      toast.error('no nostr extension found')
      onDone();
      return
    }

    try {
      const pubkey = await window.nostr.getPublicKey()
      const offerId = randomHex(16)

      const unsigned = {
        kind: KIND_OFFER,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', offerId],
          ['e', market.eventId],
          ['m', market.id],
          ['oracle', market.pubkey],
          ['side', side],
          ['maker_stake', makerStake],
          ['confidence', String(confidenceNum)],
          ['status', 'open'],
        ],
        content: '',
      }

      const signed = await window.nostr.signEvent(unsigned)
      await publish(signed)

      await db.contracts.put({
        id: offerId,
        role: 'maker',
        status: 'offer_pending',
        side,
        marketId: market.id,
        marketQuestion: market.question,
        oraclePubkey: market.pubkey,
        announcementEventId: market.eventId,
        yesHash: market.yesHash,
        noHash: market.noHash,
        resolutionBlockheight: market.resolutionBlockheight,
        counterpartyPubkey: '',
        makerStake: makerStakeNum,
        confidence: confidenceNum,
        takerStake: impliedTakerStake,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        unread: false,
      })

      toast.success('offer posted - taker requests will appear in "contracts" tab')
      onDone();
    } catch (err) {
      toast.error('failed to post offer')
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDone}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-6"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t('bet.title')}</p>
          <button type="button" onClick={onDone} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-ink/40 leading-relaxed">{market.question}</p>

        <div className="flex gap-2">
          {(['YES', 'NO'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${side === s
                ? s === 'YES' ? 'bg-positive/15 text-positive border border-positive/30' : 'bg-negative/15 text-negative border border-negative/30'
                : 'border border-ink/10 text-ink/30 hover:bg-ink/5'
                }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-ink/40">{t('bet.stake')}</label>
          <input
            type="number"
            min="1"
            placeholder="100000"
            value={makerStake}
            onChange={e => setMakerStake(e.target.value === '' ? '' : String(Math.max(1, parseInt(e.target.value, 10))))}
            className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-ink/40">{t('bet.confidence')}</label>
            <span className="text-xs font-mono text-ink/60">{confidenceNum}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="99"
            value={confidenceNum}
            onChange={e => setConfidence(e.target.value)}
            className="w-full accent-brand"
          />
          <div className="flex justify-between text-xs text-ink/20">
            <span>1%</span>
            <span>50%</span>
            <span>99%</span>
          </div>
        </div>

        <div className="bg-ink/5 rounded-lg px-4 py-4 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-ink/40">{t('bet.taker_puts')}</span>
            <span className="font-mono text-ink/70">{impliedTakerStake > 0 ? `${impliedTakerStake.toLocaleString()} sats` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">{t('bet.winner_takes')}</span>
            <span className="font-mono text-ink/70">{impliedTakerStake > 0 ? `${(makerStakeNum + impliedTakerStake).toLocaleString()} sats` : '—'}</span>
          </div>
        </div>


        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDone}
            className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors"
          >
            {t('bet.cancel')}
          </button>
          <button
            type="submit"
            disabled={!makerStake || status === 'publishing' || status === 'done'}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'publishing' ? t('bet.posting') : t('bet.post')}
          </button>
        </div>
      </form>
    </div>
  )
}
