import { useState } from 'react'
import { db } from '../../db'
import { generateSalt, derivePinKey, createPinVerifier, verifyPin, encryptPrivkey, setSessionKey } from '../../lib/pinCrypto'
import type { WalletKey } from '../../db'

async function encryptAndStoreKeys(keys: WalletKey[], pin: string, salt: Uint8Array) {
  const key = await derivePinKey(pin, salt)
  const encrypted = await Promise.all(
    keys.map(async k => ({ ...k, privkey: await encryptPrivkey(k.privkey, key) }))
  )
  await db.wallet.bulkPut(encrypted)
  return key
}

function PinInput({ value, onChange, placeholder = '• • • •', autoFocus = false }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={12}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      autoFocus={autoFocus}
      className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-center text-xl font-mono tracking-widest placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
    />
  )
}

export function SetPinScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  const pinValid = pin.length >= 4
  const match = pin === confirm
  const canSubmit = pinValid && match && confirm.length >= 4 && status !== 'loading'

  async function handleSet() {
    if (!canSubmit) return
    setStatus('loading')
    setError('')
    try {
      const allKeys = await db.wallet.toArray()
      const salt = generateSalt()
      const cryptoKey = await encryptAndStoreKeys(allKeys, pin, salt)
      const verifier = await createPinVerifier(cryptoKey)
      await db.settings.put({ key: 'wallet_pin_salt', value: btoa(String.fromCharCode(...salt)) })
      await db.settings.put({ key: 'wallet_pin_check', value: verifier })
      setSessionKey(cryptoKey)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to set PIN')
      setStatus('error')
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">secure your wallet</h1>
          <p className="text-sm text-ink/40">choose a PIN to encrypt your private keys at rest</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">PIN (4–12 digits)</label>
            <PinInput value={pin} onChange={v => { setPin(v); setStatus('idle'); setError('') }} autoFocus />
          </div>
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">confirm PIN</label>
            <PinInput value={confirm} onChange={v => { setConfirm(v); setStatus('idle'); setError('') }} />
            {confirm.length >= 4 && !match && (
              <p className="text-[11px] text-negative mt-1">PINs don't match</p>
            )}
          </div>
        </div>
        {status === 'error' && <p className="text-xs text-negative text-center">{error}</p>}
        <button
          onClick={handleSet}
          disabled={!canSubmit}
          className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          {status === 'loading' ? 'encrypting…' : 'set PIN'}
        </button>
        <p className="text-[11px] text-ink/25 text-center leading-relaxed">
          your private keys will be encrypted with AES-256-GCM using this PIN.<br />
          you'll enter it once per session.
        </p>
      </div>
    </main>
  )
}

export function UnlockScreen({ onDone }: { onDone: () => void }) {
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
      onDone()
    } catch {
      setStatus('error')
      setPin('')
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">unlock wallet</h1>
          <p className="text-sm text-ink/40">enter your PIN to decrypt your keys</p>
        </div>
        <PinInput value={pin} onChange={v => { setPin(v); setStatus('idle') }} autoFocus />
        {status === 'error' && <p className="text-xs text-negative text-center">incorrect PIN</p>}
        <button
          onClick={handleUnlock}
          disabled={pin.length < 4 || status === 'loading'}
          className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          {status === 'loading' ? 'unlocking…' : 'unlock'}
        </button>
      </div>
    </main>
  )
}
