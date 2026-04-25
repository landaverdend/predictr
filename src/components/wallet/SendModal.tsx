import { useState } from 'react'
import { Address } from '@scure/btc-signer'
import { REGTEST } from '../../lib/contract'

function isValidAddress(addr: string): boolean {
  try { Address(REGTEST).decode(addr); return true } catch { return false }
}

export function SendModal({ totalBalance, onSend, onClose }: {
  totalBalance: number
  onSend: (toAddress: string, amountSats: number) => Promise<string>
  onClose: () => void
}) {
  const [toAddress, setToAddress] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [sendMax, setSendMax] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [txid, setTxid] = useState('')

  const estimatedFee = 900
  const maxSendable = Math.max(0, totalBalance - estimatedFee)
  const amount = sendMax ? maxSendable : parseInt(amountStr, 10)
  const addressValid = isValidAddress(toAddress)
  const amountValid = !isNaN(amount) && amount > 0 && amount <= maxSendable
  const canSubmit = addressValid && amountValid && status !== 'loading'

  async function handleSend() {
    setStatus('loading')
    setError('')
    try {
      const result = await onSend(toAddress, amount)
      setTxid(result)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send failed')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
          <p className="text-sm font-medium text-positive">sent!</p>
          {txid && <p className="font-mono text-[11px] text-ink/40 break-all">{txid}</p>}
          <button type="button" onClick={onClose} className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light transition-all">
            done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">send bitcoin</p>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">destination address</label>
            <input
              type="text"
              placeholder="bcrt1p…"
              value={toAddress}
              onChange={e => { setToAddress(e.target.value.trim()); setStatus('idle'); setError('') }}
              className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
              autoFocus
            />
            {toAddress && !addressValid && <p className="text-[11px] text-negative mt-1">invalid address</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink/40">amount (sats)</label>
              <button
                type="button"
                onClick={() => { setSendMax(s => !s); setAmountStr('') }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${sendMax ? 'border-brand text-brand' : 'border-ink/15 text-ink/40 hover:text-ink/70'}`}
              >
                send max
              </button>
            </div>
            {sendMax ? (
              <div className="bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono text-ink/50">
                {maxSendable.toLocaleString()} sats
              </div>
            ) : (
              <input
                type="number"
                placeholder="0"
                min="1"
                max={maxSendable}
                value={amountStr}
                onChange={e => { setAmountStr(e.target.value); setStatus('idle'); setError('') }}
                className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
              />
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-ink/30">
          <span>available: {totalBalance.toLocaleString()} sats</span>
          <span>~{estimatedFee} sats fee</span>
        </div>
        {status === 'error' && <p className="text-xs text-negative">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors">
            cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'loading' ? 'sending…' : 'send'}
          </button>
        </div>
      </div>
    </div>
  )
}
