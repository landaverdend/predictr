import type { TxRecord } from '../../db'

export function TxHistory({ history, fetching, error }: {
  history: TxRecord[]
  fetching: boolean
  error: string | null
}) {
  return (
    <div className="space-y-2">
      {fetching && history.length === 0 && (
        <div className="text-center text-ink/30 text-sm py-16">loading history…</div>
      )}
      {fetching && history.length > 0 && (
        <p className="text-[11px] text-ink/25 text-right">refreshing…</p>
      )}
      {error && (
        <p className="text-xs text-negative bg-negative/5 border border-negative/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
      {!fetching && !error && history.length === 0 && (
        <div className="text-center text-ink/25 text-sm py-16">no transactions found</div>
      )}
      {history.map(tx => {
        const confirmed = tx.height > 0
        const date = tx.blockTime
          ? new Date(tx.blockTime * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : confirmed ? `block ${tx.height.toLocaleString()}` : null
        return (
          <div key={tx.txid} className="flex items-center gap-3 border border-ink/8 rounded-xl px-4 py-3">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${confirmed ? 'bg-positive' : 'bg-caution animate-pulse'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-ink/70 truncate">{tx.txid}</p>
              {date && <p className="text-[10px] text-ink/30 mt-0.5">{date}</p>}
            </div>
            <span className={`text-[10px] shrink-0 ${confirmed ? 'text-ink/30' : 'text-caution/70'}`}>
              {confirmed ? 'confirmed' : 'pending'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
