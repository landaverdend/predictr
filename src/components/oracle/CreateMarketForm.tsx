import { useState } from 'react'
import { useRelayContext } from '../../context/RelayContext'
import { db } from '../../db'

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256hex(hex: string): Promise<string> {
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function CreateMarketForm() {
  const { publish } = useRelayContext()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [resolutionBlockheight, setResolutionBlockheight] = useState('')
  const [imageUri, setImageUri] = useState('')
  const [relays, setRelays] = useState<string[]>(['ws://localhost:8080'])
  const [relayInput, setRelayInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  function addRelay() {
    const url = relayInput.trim()
    if (!url || relays.includes(url)) return
    setRelays(prev => [...prev, url])
    setRelayInput('')
  }

  function removeRelay(url: string) {
    setRelays(prev => prev.filter(r => r !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!window.nostr) throw new Error('no nostr extension found — install Alby or nos2x')

    setStatus('publishing')
    setError('')

    try {
      const yesPreimage = randomHex(32)
      const noPreimage = randomHex(32)
      const yesHash = await sha256hex(yesPreimage)
      const noHash = await sha256hex(noPreimage)
      const marketId = randomHex(16)
      const pubkey = await window.nostr.getPublicKey()
      const now = Date.now()

      const signed = await window.nostr.signEvent({
        kind: 8050,
        pubkey,
        created_at: Math.floor(now / 1000),
        tags: [
          ['d', marketId],
          ['question', question],
          ['yes_hash', yesHash],
          ['no_hash', noHash],
          ['resolution_blockheight', resolutionBlockheight],
          ...(imageUri ? [['image', imageUri]] : []),
          ...relays.map(r => ['r', r]),
        ],
        content: description,
      })

      await publish(signed)

      await db.oracleMarkets.put({
        id: marketId,
        eventId: signed.id,
        question,
        description,
        resolutionBlockheight: parseInt(resolutionBlockheight),
        yesHash,
        noHash,
        yesPreimage,
        noPreimage,
        createdAt: now,
      })

      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="border border-positive/20 bg-positive/5 rounded-lg p-6 text-center space-y-2">
        <p className="text-positive font-medium">market published</p>
        <p className="text-xs text-ink/40">preimages saved — resolve from the "my markets" tab when ready</p>
        <button
          onClick={() => { setStatus('idle'); setQuestion(''); setDescription(''); setResolutionBlockheight(''); setImageUri('') }}
          className="mt-4 text-xs text-ink/40 hover:text-ink/70 underline"
        >
          create another
        </button>
      </div>
    )
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">question</label>
        <input
          type="text"
          placeholder="Will BTC hit 100k before June 1 2026?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">
          description <span className="normal-case text-ink/30">(optional)</span>
        </label>
        <textarea
          placeholder="Any additional context about how this market will be resolved..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">
          image <span className="normal-case text-ink/30">(optional)</span>
        </label>
        <input
          type="url"
          placeholder="https://example.com/image.jpg"
          value={imageUri}
          onChange={e => setImageUri(e.target.value)}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />
        {imageUri && (
          <img
            src={imageUri}
            alt="preview"
            onError={e => (e.currentTarget.style.display = 'none')}
            className="mt-2 w-full h-36 object-cover rounded-lg border border-ink/10"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">resolution blockheight</label>
        <input
          type="number"
          placeholder="895000"
          value={resolutionBlockheight}
          onChange={e => setResolutionBlockheight(e.target.value)}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors font-mono"
        />
        <p className="text-xs text-ink/30">the block at or after which you commit to publishing the outcome</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">relays</label>
        <div className="space-y-2">
          {relays.map(url => (
            <div key={url} className="flex items-center justify-between bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5">
              <span className="text-sm font-mono text-ink/70">{url}</span>
              <button type="button" onClick={() => removeRelay(url)} className="text-ink/20 hover:text-ink/60 transition-colors text-lg leading-none ml-4">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="wss://relay.example.com"
            value={relayInput}
            onChange={e => setRelayInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRelay())}
            className="flex-1 bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
          />
          <button
            type="button"
            onClick={addRelay}
            disabled={!relayInput.trim()}
            className="px-4 py-2.5 text-sm border border-ink/20 rounded-lg hover:bg-ink/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            add
          </button>
        </div>
      </div>

      {status === 'error' && <p className="text-xs text-negative">{error}</p>}

      <button
        type="submit"
        disabled={!question || !resolutionBlockheight || status === 'publishing'}
        className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        {status === 'publishing' ? 'publishing...' : 'publish market'}
      </button>
    </form>
  )
}
