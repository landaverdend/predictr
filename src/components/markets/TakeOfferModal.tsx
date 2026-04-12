import { useState, useRef } from 'react'
import type { Market, Offer } from '../../lib/market'
import { takerStake } from '../../lib/market'
import { useRelayContext } from '../../context/RelayContext'
import { useElectrum } from '../../hooks/useElectrum'
import type { ElectrumUTXO } from '../../lib/electrum'
import { db } from '../../db'

const FEE_BUFFER = 2000  // sats reserved for taker's fee contribution

function pickUtxo(utxos: ElectrumUTXO[], required: number): ElectrumUTXO | null {
  const enough = utxos.filter(u => u.value >= required + FEE_BUFFER)
  if (enough.length === 0) return null
  return enough.reduce((a, b) => a.value <= b.value ? a : b)
}

export function TakeOfferModal({ market, offer, onDone }: { market: Market; offer: Offer; onDone: () => void }) {
  const { publish } = useRelayContext()
  const { client, ready: electrumReady } = useElectrum()

  const [fundingAddress, setFundingAddress] = useState('')
  const [changeAddress, setChangeAddress] = useState('')
  const [utxoStatus, setUtxoStatus] = useState<'idle' | 'loading' | 'found' | 'error'>('idle')
  const [utxoError, setUtxoError] = useState('')
  const [selectedUtxo, setSelectedUtxo] = useState<ElectrumUTXO | null>(null)

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const impliedTakerStake = takerStake(offer)

  function handleFundingAddressChange(value: string) {
    setFundingAddress(value)
    setSelectedUtxo(null)
    setUtxoStatus('idle')
    setUtxoError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) return

    debounceRef.current = setTimeout(async () => {
      if (!client) { setUtxoError('electrum not connected'); setUtxoStatus('error'); return }
      setUtxoStatus('loading')
      try {
        const utxos = await client.getUTXOs(value.trim())
        const best = pickUtxo(utxos, impliedTakerStake)
        if (!best) {
          const total = utxos.reduce((s, u) => s + u.value, 0)
          setUtxoError(
            utxos.length === 0
              ? 'no UTXOs found at this address'
              : `largest UTXO (${Math.max(...utxos.map(u => u.value)).toLocaleString()} sats) is less than required ${(impliedTakerStake + FEE_BUFFER).toLocaleString()} sats — total balance: ${total.toLocaleString()} sats`
          )
          setUtxoStatus('error')
        } else {
          setSelectedUtxo(best)
          setUtxoStatus('found')
        }
      } catch (e) {
        setUtxoError(e instanceof Error ? e.message : 'lookup failed')
        setUtxoStatus('error')
      }
    }, 600)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!window.nostr) { setSubmitError('no nostr extension found'); setSubmitStatus('error'); return }
    if (!window.nostr.nip44) { setSubmitError('nostr extension does not support NIP-44 — upgrade Alby'); setSubmitStatus('error'); return }
    if (!selectedUtxo) return
    if (!changeAddress.trim()) { setSubmitError('enter a change address'); setSubmitStatus('error'); return }

    setSubmitStatus('sending')
    setSubmitError('')

    try {
      const takerPubkey = await window.nostr.getPublicKey()
      const now = Date.now()
      const input = { txid: selectedUtxo.tx_hash, vout: selectedUtxo.tx_pos, amount: selectedUtxo.value }

      const payload = JSON.stringify({
        type: 'take_request',
        taker_pubkey: takerPubkey,
        input,
        change_address: changeAddress.trim(),
      })

      const ciphertext = await window.nostr.nip44.encrypt(offer.makerPubkey, payload)

      const dmSigned = await window.nostr.signEvent({
        kind: 14,
        pubkey: takerPubkey,
        created_at: Math.floor(now / 1000),
        tags: [['p', offer.makerPubkey], ['e', offer.eventId]],
        content: ciphertext,
      })
      await publish(dmSigned)

      await db.contracts.put({
        id: offer.eventId,
        role: 'taker',
        status: 'awaiting_psbt',
        side: offer.side === 'YES' ? 'NO' : 'YES',
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
        takerInput: input,
        takerChangeAddress: changeAddress.trim(),
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

      setSubmitStatus('done')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'unknown error')
      setSubmitStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onDone}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-xl p-7 space-y-5"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">take offer</p>
          <button type="button" onClick={onDone} className="text-white/30 hover:text-white/60 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="bg-white/5 rounded-lg px-4 py-4 space-y-2 text-xs">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/40">funding address</label>
            {!electrumReady && <span className="text-[10px] text-yellow-400/70">electrum connecting…</span>}
          </div>
          <input
            type="text"
            placeholder="bcrt1q..."
            value={fundingAddress}
            onChange={e => handleFundingAddressChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-white/40">change address</label>
          <input
            type="text"
            placeholder="bcrt1q..."
            value={changeAddress}
            onChange={e => setChangeAddress(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        {utxoStatus === 'loading' && (
          <p className="text-xs text-white/30">looking up UTXOs…</p>
        )}
        {utxoStatus === 'error' && (
          <p className="text-xs text-red-400">{utxoError}</p>
        )}
        {utxoStatus === 'found' && selectedUtxo && (
          <div className="bg-white/5 rounded-lg px-4 py-4 space-y-2 text-xs">
            <p className="text-white/30 mb-2">UTXO selected</p>
            <div className="flex justify-between">
              <span className="text-white/40">txid</span>
              <span className="font-mono text-white/60">{selectedUtxo.tx_hash.slice(0, 10)}…{selectedUtxo.tx_hash.slice(-6)}:{selectedUtxo.tx_pos}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">amount</span>
              <span className="font-mono text-white/70">{selectedUtxo.value.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">change back</span>
              <span className="font-mono text-white/70">~{(selectedUtxo.value - impliedTakerStake - FEE_BUFFER).toLocaleString()} sats</span>
            </div>
          </div>
        )}

        {submitStatus === 'error' && <p className="text-xs text-red-400">{submitError}</p>}
        {submitStatus === 'done' && <p className="text-xs text-green-400">take request sent — waiting for maker to respond</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onDone}
            className="flex-1 py-3 rounded-lg text-sm border border-white/10 text-white/40 hover:bg-white/5 transition-colors">
            cancel
          </button>
          <button
            type="submit"
            disabled={utxoStatus !== 'found' || !changeAddress.trim() || submitStatus === 'sending' || submitStatus === 'done'}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {submitStatus === 'sending' ? 'sending...' : 'send request'}
          </button>
        </div>
      </form>
    </div>
  )
}
