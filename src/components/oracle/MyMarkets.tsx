import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { MarketRow } from './MarketRow'

export function MyMarkets() {
  const markets = useLiveQuery(() => db.oracleMarkets.orderBy('createdAt').reverse().toArray()) ?? []

  if (markets.length === 0) {
    return (
      <div className="text-center text-ink/30 text-sm py-20">
        no markets yet — create one
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {markets.map(m => <MarketRow key={m.id} market={m} />)}
    </div>
  )
}
