import { useState } from 'react'
import { db } from '../db'
import { derivePinKey, verifyPin, setSessionKey } from '../lib/pinCrypto'

type Props = {
  onUnlocked: () => void
  onClose: () => void
}

export function UnlockModal({ onUnlocked, onClose }: Props) {
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  async function handleUnlock() {
    if (pin.length < 4) return
    setStatus('loading')
    try {
      const saltSetting = await db.settings.get('wallet_pin_salt')
      const verifierSetting = await db.settings.get('wallet_pin_check')
      if (!saltSetting || !verifierSetting) throw new Error('PIN data missing')

      const salt = Uint8Array.from(atob(saltSetting.value as string), c => c.charCodeAt(0))
      const cryptoKey = await derivePinKey(pin, salt)
      const ok = await verifyPin(verifierSetting.value as string, cryptoKey)
      if (!ok) { setStatus('error'); setPin(''); return }

      setSessionKey(cryptoKey)
      onUnlocked()
    } catch {
      setStatus('error')
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xs bg-surface border border-ink/10 rounded-xl p-7 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">unlock wallet</p>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-ink/40">enter your PIN to sign this transaction</p>

        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={12}
          placeholder="• • • •"
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setStatus('idle') }}
          onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          autoFocus
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-center text-xl font-mono tracking-widest placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />

        {status === 'error' && <p className="text-xs text-negative text-center">incorrect PIN</p>}

        <button
          onClick={handleUnlock}
          disabled={pin.length < 4 || status === 'loading'}
          className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          {status === 'loading' ? 'unlocking…' : 'unlock & sign'}
        </button>
      </div>
    </div>
  )
}
