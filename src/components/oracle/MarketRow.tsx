import { useState } from 'react'
import { useRelayContext } from '../../context/RelayContext'
import { useElectrumContext } from '../../context/ElectrumContext'
import { db, type OracleMarket } from '../../db'
import { KIND_RESOLUTION } from '../../lib/kinds'
import { getNostr } from '../../lib/signer'
import { BlocktimeLabel } from '../BlocktimeLabel'

export function MarketRow({ market }: { market: OracleMarket }) {
  const { publish } = useRelayContext()
  const { blockHeight } = useElectrumContext()
  const [resolving, setResolving] = useState(false)
  const [pending, setPending] = useState<'YES' | 'NO' | null>(null)
  const [error, setError] = useState('')

  async function handleResolve(outcome: 'YES' | 'NO') {
    const nostr = getNostr()
    if (!nostr) throw new Error('no nostr signer found')
    setPending(outcome)
    setError('')

    try {
      const preimage = outcome === 'YES' ? market.yesPreimage : market.noPreimage
      const pubkey = await nostr.getPublicKey()

      const signed = await nostr.signEvent({
        kind: KIND_RESOLUTION,
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
    <div className="border border-ink/10 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug flex-1">{market.question}</p>
        {resolved ? (
          <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${market.resolvedOutcome === 'YES' ? 'text-positive bg-positive/10' : 'text-negative bg-negative/10'}`}>
            resolved {market.resolvedOutcome}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded shrink-0 text-ink/40 bg-ink/5">active</span>
        )}
      </div>

      <BlocktimeLabel resolutionBlock={market.resolutionBlockheight} currentBlock={blockHeight} className="text-xs text-ink/30" />

      {!resolved && !resolving && (
        <button
          onClick={() => setResolving(true)}
          className="text-xs text-ink/40 hover:text-ink/70 underline transition-colors"
        >
          resolve market
        </button>
      )}

      {!resolved && resolving && (
        <div className="space-y-2 pt-2 border-t border-ink/5">
          <p className="text-xs text-ink/40">choose outcome to reveal preimage and publish resolution</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('YES')}
              disabled={!!pending}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-positive/15 text-positive border border-positive/30 hover:bg-positive/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending === 'YES' ? 'publishing…' : 'YES'}
            </button>
            <button
              onClick={() => handleResolve('NO')}
              disabled={!!pending}
              className="flex-1 py-2 rounded-lg text-xs font-medium bg-negative/15 text-negative border border-negative/30 hover:bg-negative/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending === 'NO' ? 'publishing…' : 'NO'}
            </button>
            <button
              onClick={() => setResolving(false)}
              disabled={!!pending}
              className="px-3 py-2 rounded-lg text-xs text-ink/30 border border-ink/10 hover:bg-ink/5 disabled:opacity-40 transition-colors"
            >
              cancel
            </button>
          </div>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>
      )}
    </div>
  )
}
