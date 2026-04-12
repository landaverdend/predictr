import { useEffect, useState } from 'react'
import type { NostrEvent } from 'nostr-tools'
import { useRelayContext } from '../context/RelayContext'
import { db } from '../db'

type Market = {
  id: string
  eventId: string
  pubkey: string
  question: string
  description: string
  resolutionBlockheight: number
  yesHash: string
  noHash: string
  imageUrl?: string
  relays: string[]
  offerCount: number
}

type Offer = {
  id: string        // d-tag
  eventId: string   // nostr event id — used for e-tag in DMs
  makerPubkey: string
  side: 'YES' | 'NO'
  makerStake: number
  confidence: number
  createdAt: number
}

function takerStake(offer: Offer): number {
  return Math.ceil(offer.makerStake * (100 - offer.confidence) / offer.confidence)
}

function tag(event: NostrEvent, name: string): string {
  return event.tags.find(t => t[0] === name)?.[1] ?? ''
}

function parseMarket(event: NostrEvent): Market {
  const imageUri = tag(event, 'image')
  return {
    id: tag(event, 'd'),
    eventId: event.id,
    pubkey: event.pubkey,
    question: tag(event, 'question'),
    description: event.content,
    resolutionBlockheight: parseInt(tag(event, 'resolution_blockheight'), 10),
    yesHash: tag(event, 'yes_hash'),
    noHash: tag(event, 'no_hash'),
    imageUrl: imageUri || undefined,
    relays: event.tags.filter(t => t[0] === 'r').map(t => t[1]),
    offerCount: 0,
  }
}

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseOffer(event: NostrEvent): Offer {
  return {
    id: tag(event, 'd'),
    eventId: event.id,
    makerPubkey: event.pubkey,
    side: tag(event, 'side') as 'YES' | 'NO',
    makerStake: parseInt(tag(event, 'maker_stake'), 10),
    confidence: parseInt(tag(event, 'confidence'), 10),
    createdAt: event.created_at * 1000,
  }
}

function truncate(pubkey: string) {
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-6)}`
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function ImagePlaceholder({ imageUrl, question }: { imageUrl?: string; question: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt={question} className="w-full h-36 object-cover rounded-t-lg" />
  }
  return (
    <div className="w-full h-36 bg-white/5 rounded-t-lg flex items-center justify-center">
      <svg className="w-8 h-8 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5M4.5 3h15A1.5 1.5 0 0121 4.5v15a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 4.5v-15A1.5 1.5 0 014.5 3z" />
      </svg>
    </div>
  )
}

function MarketGrid({ markets, onSelect }: { markets: Market[]; onSelect: (m: Market) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {markets.map(market => (
        <button
          key={market.id}
          onClick={() => onSelect(market)}
          className="text-left border border-white/10 rounded-lg overflow-hidden hover:border-white/25 transition-colors"
        >
          <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium leading-snug">{market.question}</p>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <span className="text-[9px] text-white/40 font-mono">{market.pubkey.slice(0, 2)}</span>
              </div>
              <span className="text-xs text-white/30 font-mono">{truncate(market.pubkey)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-white/30">
              <span>block {market.resolutionBlockheight.toLocaleString()}</span>
              <span>{market.offerCount} {market.offerCount === 1 ? 'offer' : 'offers'}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function PlaceBetForm({ market, onDone }: { market: Market; onDone: () => void }) {
  const { publish } = useRelayContext()
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [makerStake, setMakerStake] = useState('')
  const [confidence, setConfidence] = useState('50')
  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const confidenceNum = Math.min(99, Math.max(1, parseInt(confidence) || 50))
  const makerStakeNum = parseInt(makerStake) || 0
  const impliedTakerStake = makerStakeNum > 0
    ? Math.ceil(makerStakeNum * (100 - confidenceNum) / confidenceNum)
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!window.nostr) {
      setError('no nostr extension found — install Alby')
      setStatus('error')
      return
    }

    setStatus('publishing')
    setError('')

    try {
      const pubkey = await window.nostr.getPublicKey()
      const offerId = randomHex(16)

      const unsigned = {
        kind: 30051,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', offerId],
          ['e', market.eventId],
          ['oracle', market.pubkey],
          ['market_id', market.id],
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
        id: signed.id,
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
      })

      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDone}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">place bet</p>
          <button type="button" onClick={onDone} className="text-white/30 hover:text-white/60 transition-colors text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-white/40 leading-relaxed -mt-1">{market.question}</p>

        <div className="flex gap-2">
          {(['YES', 'NO'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                side === s
                  ? s === 'YES' ? 'bg-green-400/15 text-green-400 border border-green-400/30' : 'bg-red-400/15 text-red-400 border border-red-400/30'
                  : 'border border-white/10 text-white/30 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/40">your stake (sats)</label>
          <input
            type="number"
            min="1"
            placeholder="100000"
            value={makerStake}
            onChange={e => setMakerStake(e.target.value === '' ? '' : String(Math.max(1, parseInt(e.target.value, 10))))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/40">confidence</label>
            <span className="text-xs font-mono text-white/60">{confidenceNum}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="99"
            value={confidenceNum}
            onChange={e => setConfidence(e.target.value)}
            className="w-full accent-white"
          />
          <div className="flex justify-between text-xs text-white/20">
            <span>1%</span>
            <span>50%</span>
            <span>99%</span>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-white/40">taker puts up</span>
            <span className="font-mono text-white/70">{impliedTakerStake > 0 ? `${impliedTakerStake.toLocaleString()} sats` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">winner takes</span>
            <span className="font-mono text-white/70">{impliedTakerStake > 0 ? `${(makerStakeNum + impliedTakerStake).toLocaleString()} sats` : '—'}</span>
          </div>
        </div>

        {status === 'error' && <p className="text-xs text-red-400">{error}</p>}
        {status === 'done' && <p className="text-xs text-green-400">offer posted — takers will DM you</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onDone}
            className="flex-1 py-2.5 rounded-lg text-sm border border-white/10 text-white/40 hover:bg-white/5 transition-colors"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={!makerStake || status === 'publishing' || status === 'done'}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'publishing' ? 'posting...' : 'post offer'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TakeOfferModal({ market, offer, onDone }: { market: Market; offer: Offer; onDone: () => void }) {
  const { publish } = useRelayContext()
  const [txid, setTxid] = useState('')
  const [vout, setVout] = useState('0')
  const [amount, setAmount] = useState('')
  const [changeAddress, setChangeAddress] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const impliedTakerStake = takerStake(offer)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!window.nostr) { setError('no nostr extension found'); setStatus('error'); return }
    if (!window.nostr.nip44) { setError('nostr extension does not support NIP-44 — upgrade Alby'); setStatus('error'); return }

    setStatus('sending')
    setError('')

    try {
      const takerPubkey = await window.nostr.getPublicKey()
      const now = Date.now()

      const payload = JSON.stringify({
        type: 'take_request',
        taker_pubkey: takerPubkey,
        input: { txid, vout: parseInt(vout, 10), amount: parseInt(amount, 10) },
        change_address: changeAddress,
      })

      const ciphertext = await window.nostr.nip44.encrypt(offer.makerPubkey, payload)

      const dmUnsigned = {
        kind: 14,
        pubkey: takerPubkey,
        created_at: Math.floor(now / 1000),
        tags: [
          ['p', offer.makerPubkey],
          ['e', offer.eventId],
        ],
        content: ciphertext,
      }

      const dmSigned = await window.nostr.signEvent(dmUnsigned)
      await publish(dmSigned)

      await db.contracts.put({
        id: offer.eventId,
        role: 'taker',
        status: 'awaiting_psbt',
        side: offer.side === 'YES' ? 'NO' : 'YES',  // taker gets opposite side
        marketId: market.id,
        marketQuestion: market.question,
        oraclePubkey: market.pubkey,
        announcementEventId: market.eventId,
        yesHash: market.yesHash,
        noHash: market.noHash,
        resolutionBlockheight: market.resolutionBlockheight,
        counterpartyPubkey: offer.makerPubkey,
        makerStake: offer.makerStake,
        confidence: offer.confidence,
        takerStake: impliedTakerStake,
        takerInput: { txid, vout: parseInt(vout, 10), amount: parseInt(amount, 10) },
        takerChangeAddress: changeAddress,
        createdAt: now,
        updatedAt: now,
      })

      await db.messages.put({
        id: dmSigned.id,
        contractId: offer.eventId,
        direction: 'out',
        type: 'take_request',
        payload,
        createdAt: now,
      })

      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDone}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">take offer</p>
          <button type="button" onClick={onDone} className="text-white/30 hover:text-white/60 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="bg-white/5 rounded-lg px-4 py-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-white/40">you take side</span>
            <span className={`font-medium ${offer.side === 'YES' ? 'text-red-400' : 'text-green-400'}`}>
              {offer.side === 'YES' ? 'NO' : 'YES'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">your stake</span>
            <span className="font-mono text-white/70">{impliedTakerStake.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">you win</span>
            <span className="font-mono text-white/70">{(offer.makerStake + impliedTakerStake).toLocaleString()} sats</span>
          </div>
        </div>

        <p className="text-xs text-white/30 -mt-1">provide the UTXO you'll fund your side with</p>

        <div className="space-y-1.5">
          <label className="text-xs text-white/40">txid</label>
          <input
            type="text"
            placeholder="abc123..."
            value={txid}
            onChange={e => setTxid(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="flex gap-2">
          <div className="space-y-1.5 w-20">
            <label className="text-xs text-white/40">vout</label>
            <input
              type="number"
              min="0"
              value={vout}
              onChange={e => setVout(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <label className="text-xs text-white/40">amount (sats)</label>
            <input
              type="number"
              min={impliedTakerStake}
              placeholder={String(impliedTakerStake)}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/40">change address</label>
          <input
            type="text"
            placeholder="bc1p..."
            value={changeAddress}
            onChange={e => setChangeAddress(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        {status === 'error' && <p className="text-xs text-red-400">{error}</p>}
        {status === 'done' && <p className="text-xs text-green-400">take request sent — waiting for maker to respond</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onDone}
            className="flex-1 py-2.5 rounded-lg text-sm border border-white/10 text-white/40 hover:bg-white/5 transition-colors">
            cancel
          </button>
          <button
            type="submit"
            disabled={!txid || !amount || !changeAddress || status === 'sending' || status === 'done'}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'sending' ? 'sending...' : 'send request'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MarketDetail({ market, offers, onBack }: { market: Market; offers: Offer[]; onBack: () => void }) {
  const [placing, setPlacing] = useState(false)
  const [taking, setTaking] = useState<Offer | null>(null)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
        <span>←</span> all markets
      </button>

      <div className="border border-white/10 rounded-lg overflow-hidden">
        <ImagePlaceholder imageUrl={market.imageUrl} question={market.question} />
        <div className="p-5 space-y-4">
          <h2 className="text-lg font-semibold leading-snug">{market.question}</h2>
          {market.description && (
            <p className="text-sm text-white/50 leading-relaxed">{market.description}</p>
          )}
          <div className="flex items-center gap-3 pt-1 border-t border-white/5">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <span className="text-[10px] text-white/40 font-mono">{market.pubkey.slice(0, 2)}</span>
            </div>
            <div>
              <p className="text-xs text-white/30">oracle</p>
              <p className="text-xs font-mono text-white/60">{truncate(market.pubkey)}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-white/30">resolves at</p>
              <p className="text-xs font-mono text-white/60">block {market.resolutionBlockheight.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">open offers</h3>
          <button
            onClick={() => setPlacing(true)}
            className="text-xs border border-white/20 rounded px-3 py-1.5 hover:bg-white/5 transition-colors"
          >
            place bet
          </button>
        </div>

        {placing && <PlaceBetForm market={market} onDone={() => setPlacing(false)} />}
        {taking && <TakeOfferModal market={market} offer={taking} onDone={() => setTaking(null)} />}

        {offers.length === 0 ? (
          <div className="border border-white/10 rounded-lg p-8 text-center text-white/30 text-sm">
            no offers yet — be the first
          </div>
        ) : (
          <div className="space-y-2">
            {offers.map(offer => (
              <div key={offer.id} className="border border-white/10 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${offer.side === 'YES' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                    {offer.side}
                  </span>
                  <div>
                    <p className="text-sm font-mono">{offer.makerStake.toLocaleString()} sats</p>
                    <p className="text-xs text-white/30">
                      {offer.confidence}% confidence · {takerStake(offer).toLocaleString()} to take
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  <span className="font-mono">{truncate(offer.makerPubkey)}</span>
                  <span>{timeAgo(offer.createdAt)}</span>
                  <button
                    onClick={() => setTaking(offer)}
                    className="border border-white/20 rounded px-2.5 py-1 hover:bg-white/5 transition-colors text-white/60"
                  >
                    take
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MarketsPage() {
  const { subscribe } = useRelayContext()
  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [offers, setOffers] = useState<Record<string, Offer[]>>({})
  const [selected, setSelected] = useState<Market | null>(null)

  useEffect(() => {
    const unsub = subscribe(
      'markets-feed',
      [{ kinds: [30050, 30051] }],
      event => {
        if (event.kind === 30050) {
          const market = parseMarket(event)
          setMarkets(prev => ({ ...prev, [market.id]: { ...market, offerCount: prev[market.id]?.offerCount ?? 0 } }))
        } else if (event.kind === 30051) {
          const offer = parseOffer(event)
          const marketId = tag(event, 'market_id')
          setOffers(prev => {
            const existing = prev[marketId] ?? []
            if (existing.some(o => o.id === offer.id)) return prev
            return { ...prev, [marketId]: [...existing, offer] }
          })
          setMarkets(prev => {
            if (!prev[marketId]) return prev
            return { ...prev, [marketId]: { ...prev[marketId], offerCount: prev[marketId].offerCount + 1 } }
          })
        }
      },
    )
    return unsub
  }, [subscribe])

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      {selected ? (
        <MarketDetail
          market={selected}
          offers={offers[selected.id] ?? []}
          onBack={() => setSelected(null)}
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold mb-1">markets</h1>
              <p className="text-white/40 text-sm">open bets on nostr</p>
            </div>
          </div>
          {Object.values(markets).length === 0 ? (
            <div className="text-center text-white/30 text-sm py-20">
              no markets found on relay
            </div>
          ) : (
            <MarketGrid markets={Object.values(markets)} onSelect={setSelected} />
          )}
        </>
      )}
    </main>
  )
}
