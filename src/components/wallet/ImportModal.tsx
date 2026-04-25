import { useState } from 'react'
import { isValidMnemonic } from '../../lib/hdwallet'

export function ImportModal({ onImport, onClose }: { onImport: (mnemonic: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  const trimmed = value.trim()
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  const isValid = isValidMnemonic(trimmed)

  async function handleConfirm() {
    if (!isValid) { setError('invalid mnemonic'); setStatus('error'); return }
    setStatus('loading')
    setError('')
    try {
      await onImport(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">import seed phrase</p>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-ink/40 leading-relaxed">
          paste your 12-word BIP39 seed phrase. this will replace your current wallet.
        </p>
        <textarea
          rows={3}
          placeholder="word1 word2 word3 ..."
          value={value}
          onChange={e => { setValue(e.target.value); setStatus('idle'); setError('') }}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors resize-none"
          autoFocus
        />
        <div className="flex items-center justify-between text-xs">
          <span className={wordCount === 12 && isValid ? 'text-positive' : 'text-ink/30'}>
            {wordCount} / 12 words{wordCount === 12 && isValid ? ' · valid' : wordCount === 12 ? ' · invalid' : ''}
          </span>
          {status === 'error' && <span className="text-negative">{error}</span>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors">
            cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || status === 'loading'}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'loading' ? 'importing…' : 'import'}
          </button>
        </div>
      </div>
    </div>
  )
}
