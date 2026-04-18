import { useState } from 'react'
import { CreateMarketForm } from '../components/oracle/CreateMarketForm'
import { MyMarkets } from '../components/oracle/MyMarkets'

type Tab = 'create' | 'markets'

export default function OraclePage() {
  const [tab, setTab] = useState<Tab>('create')

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">oracle</h1>
        <p className="text-white/40 text-sm">create and resolve prediction markets</p>
      </div>

      <div className="flex gap-1 mb-8 border-b border-white/10">
        {(['create', 'markets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-white text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'markets' ? 'my markets' : t}
          </button>
        ))}
      </div>

      {tab === 'create' ? <CreateMarketForm /> : <MyMarkets />}
    </main>
  )
}
