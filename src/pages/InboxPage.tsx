import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Contract } from '../db';
import { ContractDetail } from '../components/inbox/ContractDetail';
import { useLang } from '../context/LangContext';

// Status labels are now supplied via useLang() — see contractLabel()

const STATUS_COLOR: Record<string, string> = {
  offer_pending: 'text-ink/40 bg-ink/5',
  take_received: 'text-caution bg-caution/10',
  psbt_sent: 'text-brand bg-brand/10',
  awaiting_psbt: 'text-caution bg-caution/10',
  psbt_received: 'text-brand bg-brand/10',
  funded: 'text-positive bg-positive/10',
  resolved: 'text-positive bg-positive/10',
  refunded: 'text-ink/50 bg-ink/5',
  cancelled: 'text-ink/30 bg-ink/5',
};

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function useContractLabel(contract: Contract) {
  const { t } = useLang()
  if (contract.status === 'resolved') {
    if (!contract.outcome) return { label: t('status.resolved'), color: 'text-ink/40 bg-ink/5' };
    const ourSide = contract.role === 'maker' ? contract.side : contract.side === 'YES' ? 'NO' : 'YES';
    const won = ourSide === contract.outcome;
    return won
      ? { label: t('status.won'), color: 'text-[#f59e0b] bg-[#f59e0b]/10 font-semibold' }
      : { label: t('status.lost'), color: 'text-negative bg-negative/10' };
  }
  if (contract.status === 'psbt_sent') {
    return contract.role === 'taker'
      ? { label: t('status.psbt_received'), color: STATUS_COLOR.psbt_sent }
      : { label: t('status.psbt_sent'), color: STATUS_COLOR.psbt_sent };
  }
  const statusKey = ({
    offer_pending: 'status.open',
    take_received: 'status.action_needed',
    awaiting_psbt: 'status.awaiting_psbt',
    funded: 'status.funded',
    refunded: 'status.refunded',
    cancelled: 'status.cancelled',
  } as Record<string, string>)[contract.status]
  return {
    label: statusKey ? t(statusKey as Parameters<typeof t>[0]) : contract.status,
    color: STATUS_COLOR[contract.status] ?? 'text-ink/40 bg-ink/5',
  };
}

function ContractRow({ contract, onClick }: { contract: Contract; onClick: () => void }) {
  const totalPot = contract.makerStake + contract.takerStake;
  const side = contract.role === 'maker' ? contract.side : contract.side === 'YES' ? 'NO' : 'YES';
  const { t } = useLang();
  const { label, color } = useContractLabel(contract);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg px-4 py-3.5 transition-colors ${contract.unread ? 'border-brand/30 bg-brand/5 hover:border-brand/50' : 'border-ink/10 hover:border-ink/25'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {contract.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
          <p className="text-sm font-medium leading-snug line-clamp-1">{contract.marketQuestion}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${color}`}>{label}</span>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-ink/30">
        <div className="flex items-center gap-3">
          <span className={`font-medium ${side === 'YES' ? 'text-positive/70' : 'text-negative/70'}`}>{side}</span>
          <span>{contract.role === 'maker' ? t('contracts.role_maker') : t('contracts.role_taker')}</span>
          <span className="font-mono">{totalPot.toLocaleString()} {t('contracts.sats_pot')}</span>
        </div>
        <span>{timeAgo(contract.updatedAt)}</span>
      </div>
    </button>
  );
}

type Tab = 'made' | 'taken' | 'settled'

const SETTLED = ['resolved', 'refunded', 'cancelled']

export default function InboxPage() {
  const contracts = useLiveQuery(() => db.contracts.orderBy('updatedAt').reverse().toArray()) ?? []
  const [tab, setTab] = useState<Tab>('made')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { t } = useLang()

  const selected = selectedId ? (contracts.find(c => c.id === selectedId) ?? null) : null

  const unread = {
    made: contracts.filter(c => c.role === 'maker' && !SETTLED.includes(c.status) && c.unread).length,
    taken: contracts.filter(c => c.role === 'taker' && !SETTLED.includes(c.status) && c.unread).length,
    settled: contracts.filter(c => SETTLED.includes(c.status) && c.unread).length,
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'made', label: t('contracts.tab_made') },
    { key: 'taken', label: t('contracts.tab_taken') },
    { key: 'settled', label: t('contracts.tab_settled') },
  ]

  const visible = contracts.filter(c => {
    if (tab === 'made') return c.role === 'maker' && !SETTLED.includes(c.status)
    if (tab === 'taken') return c.role === 'taker' && !SETTLED.includes(c.status)
    return SETTLED.includes(c.status)
  })

  async function openContract(id: string) {
    await db.contracts.update(id, { unread: false })
    setSelectedId(id)
  }

  if (selected) {
    return (
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <ContractDetail contract={selected} onBack={() => setSelectedId(null)} />
      </main>
    )
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{t('contracts.title')}</h1>
      </div>

      <div className="flex gap-1 mb-6 border-b border-ink/10">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-ink/40 hover:text-ink/70'
            }`}
          >
            {t.label}
            {unread[t.key] > 0 && (
              <span className="ml-1.5 text-xs bg-brand text-white rounded-full px-1.5 py-0.5 leading-none">
                {unread[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center text-ink/30 text-sm py-20">{t('contracts.empty')}</div>
      ) : (
        <div className="space-y-2">
          {visible.map(contract => (
            <ContractRow key={contract.id} contract={contract} onClick={() => openContract(contract.id)} />
          ))}
        </div>
      )}
    </main>
  )
}
