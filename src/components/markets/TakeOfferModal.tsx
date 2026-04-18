import { useState } from 'react'
import type { Market, Offer } from '../../lib/market'
import { takerStake } from '../../lib/market'
import { useRelayContext } from '../../context/RelayContext'
import { useWallet, type WalletUTXO } from '../../hooks/useWallet'
import { ChangeAddressPicker } from '../inbox/ChangeAddressPicker'
import { sendTakeRequest } from '../../lib/takeOffer'

export function TakeOfferModal({ market, offer, onDone }: { market: Market; offer: Offer; onDone: () => void }) {
  const { publish } = useRelayContext()
  const { allUtxos, keys, utxosByAddress, loading } = useWallet()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [changeAddress, setChangeAddress] = useState('')
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')

  const impliedTakerStake = takerStake(offer)
  const eligible = allUtxos().filter(w => w.utxo.value >= impliedTakerStake + 2000)
  const selected: WalletUTXO | null = eligible.find(w => `${w.utxo.tx_hash}:${w.utxo.tx_pos}` === selectedId) ?? null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !changeAddress.trim()) return

    setSubmitStatus('sending')
    setSubmitError('')
    try {
      const input = { txid: selected.utxo.tx_hash, vout: selected.utxo.tx_pos, amount: selected.utxo.value }
      await sendTakeRequest(publish, market, offer, input, changeAddress.trim(), selected.key.id)
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
            <span className="font-mono text-green-400">{(offer.makerStake + impliedTakerStake).toLocaleString()} sats</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-white/40">select UTXO</p>
          {loading && <p className="text-xs text-white/30">loading wallet…</p>}
          {!loading && keys.length === 0 && (
            <p className="text-xs text-red-400">no wallet keys — generate one in the wallet tab</p>
          )}
          {!loading && keys.length > 0 && eligible.length === 0 && (
            <p className="text-xs text-red-400">no UTXOs with enough balance — need at least {(impliedTakerStake + 2000).toLocaleString()} sats</p>
          )}
          {eligible.map(w => {
            const id = `${w.utxo.tx_hash}:${w.utxo.tx_pos}`
            const active = selectedId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedId(id)}
                className={`w-full text-left rounded-lg border px-4 py-3 text-xs font-mono transition-colors ${active ? 'border-white/40 bg-white/5' : 'border-white/10 hover:border-white/20'}`}
              >
                <div className="flex justify-between">
                  <span className="text-white/40">{w.utxo.tx_hash.slice(0, 10)}…:{w.utxo.tx_pos}</span>
                  <span className="text-white/70">{w.utxo.value.toLocaleString()} sats</span>
                </div>
                <div className="text-white/30 mt-0.5">{w.key.address.slice(0, 20)}…</div>
              </button>
            )
          })}
        </div>

        <ChangeAddressPicker
          value={changeAddress}
          onChange={setChangeAddress}
          keys={keys}
          utxosByAddress={utxosByAddress}
          highlightAddress={selected?.key.address}
        />

        {submitStatus === 'error' && <p className="text-xs text-red-400">{submitError}</p>}
        {submitStatus === 'done' && <p className="text-xs text-green-400">take request sent — waiting for maker to respond</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onDone}
            className="flex-1 py-3 rounded-lg text-sm border border-white/10 text-white/40 hover:bg-white/5 transition-colors">
            cancel
          </button>
          <button
            type="submit"
            disabled={!selected || !changeAddress.trim() || submitStatus === 'sending' || submitStatus === 'done'}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {submitStatus === 'sending' ? 'sending...' : 'send request'}
          </button>
        </div>
      </form>
    </div>
  )
}
