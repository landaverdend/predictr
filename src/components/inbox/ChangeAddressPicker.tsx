import { useState } from 'react'
import type { WalletKey } from '../../db'
import type { ElectrumUTXO } from '../../lib/electrum'

type Props = {
  value: string
  onChange: (address: string) => void
  keys: WalletKey[]
  utxosByAddress: Record<string, ElectrumUTXO[]>
  highlightAddress?: string   // the funding UTXO address
}

export function ChangeAddressPicker({ value, onChange, keys, utxosByAddress, highlightAddress }: Props) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  function select(address: string) {
    onChange(address)
    setOpen(false)
    setShowCustom(false)
  }

  function commitCustom() {
    if (custom.trim()) select(custom.trim())
  }

  const displayValue = value
    ? `${value.slice(0, 14)}…${value.slice(-8)}`
    : 'select address'

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/40">change address</p>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs font-mono text-white/70 hover:border-white/20 transition-colors flex justify-between items-center"
      >
        <span className={value ? 'text-white/70' : 'text-white/20'}>{displayValue}</span>
        <span className="text-white/30 ml-2">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border border-white/10 rounded-lg overflow-hidden bg-[#111]">
          {keys.map(k => {
            const utxos = utxosByAddress[k.address] ?? []
            const total = utxos.reduce((s, u) => s + u.value, 0)
            const isHighlighted = k.address === highlightAddress
            const isSelected = k.address === value

            return (
              <button
                key={k.id}
                type="button"
                onClick={() => select(k.address)}
                className={`w-full text-left px-4 py-3 text-xs transition-colors border-b border-white/5 last:border-0 flex justify-between items-start gap-4
                  ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    {isHighlighted && (
                      <span className="text-[10px] text-yellow-400/80 border border-yellow-400/30 rounded px-1 py-px leading-none shrink-0">funding</span>
                    )}
                    <span className="font-mono text-white/60 truncate">{k.address}</span>
                  </div>
                  <div className="text-white/30">{utxos.length} UTXO{utxos.length !== 1 ? 's' : ''}</div>
                </div>
                <span className="font-mono text-white/60 shrink-0">{total.toLocaleString()} sats</span>
              </button>
            )
          })}

          {/* custom address row */}
          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="w-full text-left px-4 py-3 text-xs text-white/30 hover:text-white/50 hover:bg-white/5 transition-colors border-t border-white/5"
            >
              + enter custom address
            </button>
          ) : (
            <div className="p-3 border-t border-white/5 flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder="bcrt1q…"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && commitCustom()}
                className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                onClick={commitCustom}
                disabled={!custom.trim()}
                className="px-3 py-2 text-xs border border-white/20 rounded hover:bg-white/5 disabled:opacity-30 transition-colors"
              >
                use
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
