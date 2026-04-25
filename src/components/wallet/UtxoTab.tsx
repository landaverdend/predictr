import { useState, useEffect } from 'react'
import type { WalletUTXO } from '../../hooks/useWallet'
import type { ElectrumClient } from '../../lib/electrumClient'
import { sendFee } from '../../lib/feeEstimator'
import { consolidateUtxos } from '../../lib/spend'
import { toast } from 'sonner'

function utxoId(w: WalletUTXO) {
  return `${w.utxo.tx_hash}:${w.utxo.tx_pos}`
}

export function UtxoTab({
  utxos,
  loading,
  electrum,
  onConsolidated,
}: {
  utxos: WalletUTXO[]
  loading: boolean
  electrum: ElectrumClient | null
  onConsolidated: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toAddress, setToAddress] = useState('')
  const [feeRate, setFeeRate] = useState(1)
  const [consolidating, setConsolidating] = useState(false)

  useEffect(() => {
    if (electrum) electrum.getFeeRate().then(setFeeRate).catch(() => setFeeRate(1))
  }, [electrum])

  // Drop stale selections if UTXOs change (e.g. after consolidation)
  useEffect(() => {
    const ids = new Set(utxos.map(utxoId))
    setSelected(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [utxos])

  function toggleAll() {
    setSelected(selected.size === utxos.length ? new Set() : new Set(utxos.map(utxoId)))
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedUtxos = utxos.filter(w => selected.has(utxoId(w)))
  const totalIn = selectedUtxos.reduce((s, w) => s + w.utxo.value, 0)
  const fee = sendFee(selectedUtxos.length, feeRate)
  const netOut = totalIn - fee
  const canConsolidate = selected.size >= 2 && toAddress.trim() !== '' && netOut > 546 && !!electrum && !consolidating

  async function handleConsolidate() {
    if (!electrum) return
    setConsolidating(true)
    try {
      const txid = await consolidateUtxos(selectedUtxos, toAddress.trim(), electrum)
      toast.success(`consolidated — txid: ${txid.slice(0, 16)}…`)
      setSelected(new Set())
      setToAddress('')
      onConsolidated()
    } catch (err) {
      const msg = err instanceof Error
        ? (err.message || (err as DOMException).name || 'unknown error')
        : String(err)
      toast.error(msg || 'consolidation failed')
    } finally {
      setConsolidating(false)
    }
  }

  if (loading && utxos.length === 0) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className="border border-ink/10 rounded-lg px-4 py-3 flex justify-between animate-pulse">
            <div className="h-3 w-32 rounded bg-ink/10" />
            <div className="h-3 w-20 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    )
  }

  if (!loading && utxos.length === 0) {
    return <p className="text-sm text-ink/30 text-center py-16">no UTXOs</p>
  }

  return (
    <div className="space-y-4">
      {/* UTXO list */}
      <div className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-elevated border-b border-ink/8">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={selected.size === utxos.length && utxos.length > 0}
              indeterminate={selected.size > 0 && selected.size < utxos.length}
              onChange={toggleAll}
            />
            <span className="text-xs text-ink/40 uppercase tracking-wider">
              {selected.size > 0 ? `${selected.size} selected` : 'UTXO'}
            </span>
          </label>
          <span className="text-xs text-ink/30 uppercase tracking-wider hidden sm:block">amount</span>
        </div>
        <div className="divide-y divide-ink/5">
          {utxos.map(w => {
            const id = utxoId(w)
            const checked = selected.has(id)
            const confirmed = w.utxo.height > 0
            return (
              <label
                key={id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? 'bg-brand/5' : 'hover:bg-elevated'}`}
              >
                <Checkbox checked={checked} onChange={() => toggle(id)} />
                <span className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-ink/50 truncate">
                      {w.utxo.tx_hash.slice(0, 12)}…:{w.utxo.tx_pos}
                    </span>
                    <span className="font-mono text-xs text-ink/70 shrink-0">
                      {w.utxo.value.toLocaleString()} sats
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-ink/30 truncate">{w.key.address}</span>
                    <span className={`text-[10px] px-1.5 py-px rounded-full shrink-0 ${confirmed ? 'bg-positive/10 text-positive/70' : 'bg-amber-400/10 text-amber-400/70'}`}>
                      {confirmed ? 'confirmed' : 'unconfirmed'}
                    </span>
                  </div>
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Consolidate panel — only shown when ≥1 selected */}
      {selected.size > 0 && (
        <div className="border border-ink/15 rounded-xl p-4 space-y-3">
          <p className="text-xs text-ink/50 uppercase tracking-wider">consolidate selected</p>

          <div className="bg-ink/5 rounded-lg px-4 py-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-ink/40">inputs</span>
              <span className="font-mono text-ink/60">{selected.size} UTXOs · {totalIn.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/40">fee (~{feeRate} sat/vb)</span>
              <span className="font-mono text-ink/60">{fee.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between border-t border-ink/10 pt-1.5 mt-0.5">
              <span className="text-ink/60 font-medium">output</span>
              <span className={`font-mono font-medium ${netOut > 546 ? 'text-positive' : 'text-negative'}`}>
                {netOut > 0 ? `${netOut.toLocaleString()} sats` : '—'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-ink/40">destination address</label>
            <input
              type="text"
              value={toAddress}
              onChange={e => setToAddress(e.target.value.trim())}
              placeholder="bcrt1p…"
              className="w-full bg-ink/5 border border-ink/10 rounded-lg px-3 py-2.5 text-xs font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
            />
          </div>

          {selected.size < 2 && (
            <p className="text-[11px] text-ink/30">select at least 2 UTXOs to consolidate</p>
          )}

          <button
            type="button"
            onClick={handleConsolidate}
            disabled={!canConsolidate}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {consolidating ? 'consolidating…' : `merge ${selected.size} UTXOs`}
          </button>
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); onChange() }}
      className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        checked || indeterminate ? 'bg-brand border-brand text-white' : 'border-ink/25 hover:border-ink/50'
      }`}
    >
      {indeterminate && !checked
        ? <svg viewBox="0 0 10 2" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1h8"/></svg>
        : checked
          ? <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4l2.5 2.5L9 1"/></svg>
          : null
      }
    </button>
  )
}
