import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contract } from '../db'
import { ContractDetail } from '../components/inbox/ContractDetail'
import { useDMs } from '../hooks/useDMs'
import { useWatchFunding } from '../hooks/useWatchFunding'
import { useWatchResolution } from '../hooks/useWatchResolution'

const STATUS_LABEL: Record<string, string> = {
  offer_pending: 'open',
  take_received: 'action needed',
  psbt_sent: 'psbt sent',
  awaiting_psbt: 'pending maker response',
  funded: 'funded',
  resolved: 'resolved',
  refunded: 'refunded',
  cancelled: 'cancelled',
}

const STATUS_COLOR: Record<string, string> = {
  offer_pending: 'text-white/40 bg-white/5',
  take_received: 'text-yellow-400 bg-yellow-400/10',
  psbt_sent: 'text-blue-400 bg-blue-400/10',
  awaiting_psbt: 'text-yellow-400 bg-yellow-400/10',
  funded: 'text-green-400 bg-green-400/10',
  resolved: 'text-green-400 bg-green-400/10',
  refunded: 'text-white/50 bg-white/5',
  cancelled: 'text-white/30 bg-white/5',
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function resolvedLabel(contract: Contract): { label: string; color: string } {
  if (contract.status !== 'resolved' || !contract.outcome) return { label: 'resolved', color: 'text-white/40 bg-white/5' }
  const ourSide = contract.role === 'maker' ? contract.side : (contract.side === 'YES' ? 'NO' : 'YES')
  const won = ourSide === contract.outcome
  return won
    ? { label: 'won', color: 'text-green-400 bg-green-400/10' }
    : { label: 'lost', color: 'text-red-400 bg-red-400/10' }
}

function ContractRow({ contract, onClick }: { contract: Contract; onClick: () => void }) {
  const totalPot = contract.makerStake + contract.takerStake
  const side = contract.role === 'maker' ? contract.side : (contract.side === 'YES' ? 'NO' : 'YES')
  const { label, color } = contract.status === 'resolved'
    ? resolvedLabel(contract)
    : { label: STATUS_LABEL[contract.status] ?? contract.status, color: STATUS_COLOR[contract.status] ?? 'text-white/40 bg-white/5' }

  return (
    <button
      onClick={onClick}
      className="w-full text-left border border-white/10 rounded-lg px-4 py-3.5 hover:border-white/25 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug flex-1 line-clamp-1">{contract.marketQuestion}</p>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${color}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-white/30">
        <div className="flex items-center gap-3">
          <span className={`font-medium ${side === 'YES' ? 'text-green-400/70' : 'text-red-400/70'}`}>{side}</span>
          <span>{contract.role}</span>
          <span className="font-mono">{totalPot.toLocaleString()} sats pot</span>
        </div>
        <span>{timeAgo(contract.updatedAt)}</span>
      </div>
    </button>
  )
}

export default function InboxPage() {
  useDMs()

  const contracts = useLiveQuery(() => db.contracts.orderBy('updatedAt').reverse().toArray()) ?? []
  useWatchFunding(contracts)
  useWatchResolution(contracts)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId ? (contracts.find(c => c.id === selectedId) ?? null) : null

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
        <p className="text-white/40 text-sm">your active and pending contracts</p>
      </div>

      {contracts.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-20">
          no contracts yet — post an offer or take one
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map(contract => (
            <ContractRow key={contract.id} contract={contract} onClick={() => setSelectedId(contract.id)} />
          ))}
        </div>
      )}
    </main>
  )
}
