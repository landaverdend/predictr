import { useRelay } from './hooks/useRelay'

const STATUS_COLOR = {
  connected: 'bg-green-400',
  connecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-red-400',
}

export default function App() {
  const { status } = useRelay('ws://localhost:8080')

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="font-mono font-bold tracking-tight">nostr_dlc</span>
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]}`} />
          {status}
        </div>
      </header>

      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-1">markets</h1>
        <p className="text-white/40 text-sm mb-8">open bets on nostr</p>

        <div className="space-y-3">
          {[
            { question: 'Will BTC hit 100k before June?', side: 'YES', amount: '10,000 sats', expiry: 'Jun 1' },
            { question: 'Will ETH ETF see net inflows this week?', side: 'NO', amount: '50,000 sats', expiry: 'Apr 12' },
          ].map((offer, i) => (
            <div key={i} className="border border-white/10 rounded-lg p-4 flex items-center justify-between hover:border-white/20 transition-colors">
              <div>
                <p className="text-sm font-medium">{offer.question}</p>
                <p className="text-xs text-white/40 mt-1">
                  <span className={offer.side === 'YES' ? 'text-green-400' : 'text-red-400'}>{offer.side}</span>
                  {' · '}{offer.amount}{' · expires {offer.expiry}'}
                </p>
              </div>
              <button className="text-xs border border-white/20 rounded px-3 py-1.5 hover:bg-white/5 transition-colors ml-4 shrink-0">
                take bet
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
