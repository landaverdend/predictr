import { useState } from 'react'
import { type Contract } from '../../db'
import { claimFunding } from '../../lib/spend'
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
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface border border-ink/10 rounded-xl p-6 space-y-5">

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">claim winnings</h2>
          <button onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-lg leading-none">×</button>
        </div>

        {/* Summary */}
        <div className="bg-positive/5 border border-positive/20 rounded-lg p-4 space-y-1 text-xs">
          <p className="text-positive font-medium uppercase tracking-wider mb-2">you won</p>
          <div className="flex justify-between">
            <span className="text-ink/40">total pot</span>
            <span className="font-mono text-ink/70">{totalPot.toLocaleString()} sats</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">network fee</span>
            <span className="font-mono text-ink/40">−2,000 sats</span>
          </div>
          <div className="flex justify-between border-t border-ink/10 pt-1 mt-1">
            <span className="text-ink/60">you receive</span>
            <span className="font-mono text-positive font-medium">{(totalPot - 2000).toLocaleString()} sats</span>
          </div>
        </div>

        {/* Address selection */}
        <div className="space-y-2">
          <p className="text-xs text-ink/40">payout address</p>

          {keys.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {keys.map(k => {
                const balance = (utxosByAddress[k.address] ?? []).reduce((s, u) => s + u.value, 0)
                const isSelected = !useCustom && selectedAddress === k.address
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => { setSelectedAddress(k.address); setUseCustom(false) }}
                    className={`w-full text-left rounded-lg border px-4 py-3 text-xs transition-colors flex items-center justify-between gap-3
                      ${isSelected ? 'border-ink/40 bg-ink/5' : 'border-ink/10 hover:border-ink/20'}`}
                  >
                    <span className={`font-mono ${isSelected ? 'text-ink/80' : 'text-ink/50'}`}>
                      {truncateAddress(k.address)}
                    </span>
                    {balance > 0 && (
                      <span className="font-mono text-ink/40 shrink-0">{balance.toLocaleString()} sats</span>
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
              className="text-xs text-ink/30 hover:text-ink/50 transition-colors"
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
                className="w-full bg-ink/5 border border-ink/10 rounded-lg px-3 py-3 text-xs font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
              />
              <button
                type="button"
                onClick={() => { setUseCustom(false); setCustom('') }}
                className="text-xs text-ink/30 hover:text-ink/50 transition-colors"
              >
                ← back to wallet addresses
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-negative">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-ink/40 border border-ink/10 rounded-lg hover:border-ink/25 hover:text-ink/60 transition-colors"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming || !payoutAddress}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-positive rounded-lg hover:bg-positive/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {claiming ? 'claiming…' : 'claim'}
          </button>
        </div>
      </div>
    </div>
  )
}
