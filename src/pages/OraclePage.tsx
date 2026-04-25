import { useState } from 'react'
import { CreateMarketForm } from '../components/oracle/CreateMarketForm'
import { MyMarkets } from '../components/oracle/MyMarkets'
import { useLang } from '../context/LangContext'

type Tab = 'create' | 'markets'

export default function OraclePage() {
  const [tab, setTab] = useState<Tab>('create')
  const { t } = useLang()

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">{t('oracle.title')}</h1>
        <p className="text-ink/40 text-sm">{t('oracle.subtitle')}</p>
      </div>

      <div className="flex gap-1 mb-8 border-b border-ink/10">
        {(['create', 'markets'] as Tab[]).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === tabKey
                ? 'border-brand text-ink'
                : 'border-transparent text-ink/40 hover:text-ink/70'
            }`}
          >
            {tabKey === 'markets' ? t('oracle.tab_markets') : t('oracle.tab_create')}
          </button>
        ))}
      </div>

      {tab === 'create' ? <CreateMarketForm /> : <MyMarkets />}
    </main>
  )
}
