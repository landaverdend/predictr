import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contract } from '../db'
import { ContractDetail } from '../components/inbox/ContractDetail'
import { useWatchFunding } from '../hooks/useWatchFunding'
import { useWatchResolution } from '../hooks/useWatchResolution'

const STATUS_LABEL: Record<string, string> = {
  offer_pending:  'open',
  take_received:  'action needed',
  psbt_sent:      'psbt sent',
  awaiting_psbt:  'pending maker response',
  funded:         'funded',
  resolved:       'resolved',
  refunded:       'refunded',
  cancelled:      'cancelled',
}

const STATUS_COLOR: Record<string, string> = {
  offer_pending:  'text-ink/40 bg-ink/5',
  take_received:  'text-caution bg-caution/10',
  psbt_sent:      'text-brand bg-brand/10',
  awaiting_psbt:  'text-caution bg-caution/10',
  funded:         'text-positive bg-positive/10',
  resolved:       'text-positive bg-positive/10',
  refunded:       'text-ink/50 bg-ink/5',
  cancelled:      'text-ink/30 bg-ink/5',
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function contractLabel(contract: Contract): { label: string; color: string } {
  if (contract.status === 'resolved') {
    if (!contract.outcome) return { label: 'resolved', color: 'text-ink/40 bg-ink/5' }
    const ourSide = contract.role === 'maker' ? contract.side : (contract.side === 'YES' ? 'NO' : 'YES')
    const won = ourSide === contract.outcome
    return won
      ? { label: 'won', color: 'text-[#f59e0b] bg-[#f59e0b]/10 font-semibold' }
      : { label: 'lost', color: 'text-negative bg-negative/10' }
  }
  if (contract.status === 'psbt_sent') {
    return contract.role === 'taker'
      ? { label: 'psbt received', color: STATUS_COLOR.psbt_sent }
      : { label: 'psbt sent', color: STATUS_COLOR.psbt_sent }
  }
  return { label: STATUS_LABEL[contract.status] ?? contract.status, color: STATUS_COLOR[contract.status] ?? 'text-ink/40 bg-ink/5' }
}

function ContractRow({ contract, onClick }: { contract: Contract; onClick: () => void }) {
  const totalPot = contract.makerStake + contract.takerStake
  const side = contract.role === 'maker' ? contract.side : (contract.side === 'YES' ? 'NO' : 'YES')
  const { label, color } = contractLabel(contract)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg px-4 py-3.5 transition-colors ${contract.unread ? 'border-brand/30 bg-brand/5 hover:border-brand/50' : 'border-ink/10 hover:border-ink/25'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {contract.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />}
          <p className="text-sm font-medium leading-snug line-clamp-1">{contract.marketQuestion}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${color}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-ink/30">
        <div className="flex items-center gap-3">
          <span className={`font-medium ${side === 'YES' ? 'text-positive/70' : 'text-negative/70'}`}>{side}</span>
          <span>{contract.role}</span>
          <span className="font-mono">{totalPot.toLocaleString()} sats pot</span>
        </div>
        <span>{timeAgo(contract.updatedAt)}</span>
      </div>
    </button>
  )
}

export default function InboxPage() {
  const contracts = useLiveQuery(() => db.contracts.orderBy('updatedAt').reverse().toArray()) ?? []
  useWatchFunding(contracts)
  useWatchResolution(contracts)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId ? (contracts.find(c => c.id === selectedId) ?? null) : null

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">contracts</h1>
        <p className="text-ink/40 text-sm">your active and pending contracts</p>
      </div>

      {contracts.length === 0 ? (
        <div className="text-center text-ink/30 text-sm py-20">
          no contracts yet — post an offer or take one
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map(contract => (
            <ContractRow key={contract.id} contract={contract} onClick={() => openContract(contract.id)} />
          ))}
        </div>
      )}
    </main>
  )
}
