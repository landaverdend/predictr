import { useState } from 'react'
import { useRelayContext } from '../context/RelayContext'

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

export default function OraclePage() {
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
    if (!window.nostr) {
      setError('no nostr extension found — install Alby or nos2x')
      setStatus('error')
      return
    }

    setStatus('publishing')
    setError('')

    try {
      const yesPreimage = randomHex(32)
      const noPreimage = randomHex(32)
      const yesHash = await sha256hex(yesPreimage)
      const noHash = await sha256hex(noPreimage)
      const marketId = randomHex(16)

      const pubkey = await window.nostr.getPublicKey()
      const created_at = Math.floor(Date.now() / 1000)

      const unsigned = {
        kind: 30050,
        pubkey,
        created_at,
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
      }

      const signed = await window.nostr.signEvent(unsigned)
      await publish(signed)

      // store preimages locally — oracle needs these to resolve later
      const key = `oracle:preimages:${marketId}`
      localStorage.setItem(key, JSON.stringify({ yesPreimage, noPreimage, marketId, question }))

      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setStatus('error')
    }
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">create market</h1>
      <p className="text-white/40 text-sm mb-8">
        as an oracle, you commit to resolving this market by revealing a preimage at the resolution block
      </p>

      {status === 'done' ? (
        <div className="border border-green-400/20 bg-green-400/5 rounded-lg p-6 text-center space-y-2">
          <p className="text-green-400 font-medium">market published</p>
          <p className="text-xs text-white/40">preimages saved to localStorage — keep them safe, you'll need one to resolve</p>
          <button onClick={() => { setStatus('idle'); setQuestion(''); setDescription(''); setResolutionBlockheight('') }}
            className="mt-4 text-xs text-white/40 hover:text-white/70 underline">
            create another
          </button>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50 uppercase tracking-wider">question</label>
            <input
              type="text"
              placeholder="Will BTC hit 100k before June 1 2026?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50 uppercase tracking-wider">
              description <span className="normal-case text-white/30">(optional)</span>
            </label>
            <textarea
              placeholder="Any additional context about how this market will be resolved..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50 uppercase tracking-wider">
              image <span className="normal-case text-white/30">(optional)</span>
            </label>
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={imageUri}
              onChange={e => setImageUri(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
            {imageUri && (
              <img
                src={imageUri}
                alt="preview"
                onError={e => (e.currentTarget.style.display = 'none')}
                className="mt-2 w-full h-36 object-cover rounded-lg border border-white/10"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50 uppercase tracking-wider">resolution blockheight</label>
            <input
              type="number"
              placeholder="895000"
              value={resolutionBlockheight}
              onChange={e => setResolutionBlockheight(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors font-mono"
            />
            <p className="text-xs text-white/30">
              the block at or after which you commit to publishing the outcome
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/50 uppercase tracking-wider">relays</label>
            <div className="space-y-2">
              {relays.map(url => (
                <div key={url} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-mono text-white/70">{url}</span>
                  <button
                    type="button"
                    onClick={() => removeRelay(url)}
                    className="text-white/20 hover:text-white/60 transition-colors text-lg leading-none ml-4"
                  >
                    ×
                  </button>
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
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                type="button"
                onClick={addRelay}
                disabled={!relayInput.trim()}
                className="px-4 py-2.5 text-sm border border-white/20 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                add
              </button>
            </div>
          </div>

          <div className="border border-white/10 rounded-lg p-4 space-y-2">
            <p className="text-xs text-white/50 uppercase tracking-wider mb-3">outcome commitments</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400">YES</span>
              <span className="text-xs text-white/30 font-mono">preimage generated on publish</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-400">NO</span>
              <span className="text-xs text-white/30 font-mono">preimage generated on publish</span>
            </div>
            <p className="text-xs text-white/20 pt-1 border-t border-white/5 mt-2">
              two random preimages will be generated. their SHA256 hashes are committed to on-chain. you reveal one when the market resolves.
            </p>
          </div>

          {status === 'error' && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={!question || !resolutionBlockheight || status === 'publishing'}
            className="w-full py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'publishing' ? 'publishing...' : 'publish market'}
          </button>

        </form>
      )}
    </main>
  )
}
