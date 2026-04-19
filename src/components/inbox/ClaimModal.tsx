import { useState } from 'react'
import { type Contract } from '../../db'
import { claimFunding } from '../../lib/claimFunding'
import { useElectrum } from '../../hooks/useElectrum'
import { useWallet } from '../../hooks/useWallet'

function truncateAddress(addr: string, keep = 10): string {
  if (addr.length <= keep * 2) return addr
  return `${addr.slice(0, keep)}…${addr.slice(-keep)}`
}

type Props = {
  contract: Contract
  onClose: () => void
}

export function ClaimModal({ contract, onClose }: Props) {
  const { keys, utxosByAddress } = useWallet()
  const [selectedAddress, setSelectedAddress] = useState('')
  const [custom, setCustom] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const { client } = useElectrum()

  const totalPot = contract.makerStake + contract.takerStake
  const payoutAddress = useCustom ? custom.trim() : selectedAddress

  async function handleClaim() {
    if (!client) { setError('electrum not connected'); return }
    if (!payoutAddress) { setError('select or enter a payout address'); return }
    setClaiming(true)
    setError('')
    try {
      await claimFunding(contract, client, payoutAddress)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'claim failed')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#111] border border-white/10 rounded-xl p-6 space-y-5">

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">claim winnings</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none">×</button>
        </div>

        {/* Summary */}
        <div className="bg-green-400/5 border border-green-400/20 rounded-lg p-4 space-y-1 text-xs">
          <p className="text-green-400 font-medium uppercase tracking-wider mb-2">you won</p>
          <div className="flex justify-between">
            <span className="text-white/40">total pot</span>
            <span className="font-mono text-white/70">{totalPot.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">network fee</span>
            <span className="font-mono text-white/40">−2,000 sats</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-1 mt-1">
            <span className="text-white/60">you receive</span>
            <span className="font-mono text-green-400 font-medium">{(totalPot - 2000).toLocaleString()} sats</span>
          </div>
        </div>

        {/* Address selection */}
        <div className="space-y-2">
          <p className="text-xs text-white/40">payout address</p>

          {keys.length > 0 && (
            <div className="space-y-1.5">
              {keys.map(k => {
                const balance = (utxosByAddress[k.address] ?? []).reduce((s, u) => s + u.value, 0)
                const isSelected = !useCustom && selectedAddress === k.address
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setSelectedAddress(k.address); setUseCustom(false) }}
                    className={`w-full text-left rounded-lg border px-4 py-3 text-xs transition-colors flex items-center justify-between gap-3
                      ${isSelected ? 'border-white/40 bg-white/5' : 'border-white/10 hover:border-white/20'}`}
                  >
                    <span className={`font-mono ${isSelected ? 'text-white/80' : 'text-white/50'}`}>
                      {truncateAddress(k.address)}
                    </span>
                    {balance > 0 && (
                      <span className="font-mono text-white/40 shrink-0">{balance.toLocaleString()} sats</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {!useCustom ? (
            <button
              type="button"
              onClick={() => { setUseCustom(true); setSelectedAddress('') }}
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              + use external address
            </button>
          ) : (
            <div className="space-y-1.5">
              <input
                autoFocus
                type="text"
                placeholder="bcrt1q…"
                value={custom}
                onChange={e => setCustom(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                type="button"
                onClick={() => { setUseCustom(false); setCustom('') }}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                ← back to wallet addresses
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-white/40 border border-white/10 rounded-lg hover:border-white/25 hover:text-white/60 transition-colors"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming || !payoutAddress}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-black bg-green-400 rounded-lg hover:bg-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {claiming ? 'claiming…' : 'claim'}
          </button>
        </div>
      </div>
    </div>
  )
}
