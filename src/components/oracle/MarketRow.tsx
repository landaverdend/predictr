import { useState } from 'react'
import { useRelayContext } from '../../context/RelayContext'
import { db, type OracleMarket } from '../../db'

export function MarketRow({ market }: { market: OracleMarket }) {
  const { publish } = useRelayContext()
  const [resolving, setResolving] = useState(false)
  const [pending, setPending] = useState<'YES' | 'NO' | null>(null)
  const [error, setError] = useState('')

  async function handleResolve(outcome: 'YES' | 'NO') {
    if (!window.nostr) throw new Error('no nostr extension found')
    setPending(outcome)
    setError('')

    try {
      const preimage = outcome === 'YES' ? market.yesPreimage : market.noPreimage
      const pubkey = await window.nostr.getPublicKey()

      const signed = await window.nostr.signEvent({
        kind: 8052,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', market.id],
          ['e', market.eventId],
          ['outcome', outcome],
          ['preimage', preimage],
        ],
        content: '',
      })

      await publish(signed)
      await db.oracleMarkets.update(market.id, {
        resolvedOutcome: outcome,
        resolutionEventId: signed.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
      setPending(null)
    }
  }

  const resolved = !!market.resolvedOutcome

  return (
    <div className="border border-white/10 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug flex-1">{market.question}</p>
        {resolved ? (
          <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${market.resolvedOutcome === 'YES' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
            resolved {market.resolvedOutcome}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded shrink-0 text-white/40 bg-white/5">active</span>
        )}
      </div>

      <p className="text-xs text-white/30 font-mono">resolves at block {market.resolutionBlockheight.toLocaleString()}</p>

      {!resolved && !resolving && (
        <button
          onClick={() => setResolving(true)}
          className="text-xs text-white/40 hover:text-white/70 underline transition-colors"
        >
          resolve market
        </button>
      )}

      {!resolved && resolving && (
        <div className="space-y-2 pt-2 border-t border-white/5">
          <p className="text-xs text-white/40">choose outcome to reveal preimage and publish resolution</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('YES')}
              disabled={!!pending}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-green-400/15 text-green-400 border border-green-400/30 hover:bg-green-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending === 'YES' ? 'publishing…' : 'YES'}
            </button>
            <button
              onClick={() => handleResolve('NO')}
              disabled={!!pending}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-400/15 text-red-400 border border-red-400/30 hover:bg-red-400/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending === 'NO' ? 'publishing…' : 'NO'}
            </button>
            <button
              onClick={() => setResolving(false)}
              disabled={!!pending}
              className="px-3 py-2 rounded-lg text-xs text-white/30 border border-white/10 hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
