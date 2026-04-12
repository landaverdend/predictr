import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Contract, type Message } from '../db'

const STATUS_LABEL: Record<string, string> = {
  offer_pending: 'open',
  take_received: 'action needed',
  psbt_sent: 'psbt sent',
  awaiting_psbt: 'awaiting psbt',
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

function truncate(pubkey: string) {
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-6)}`
}

function ContractDetail({ contract, onBack }: { contract: Contract; onBack: () => void }) {
  const messages = useLiveQuery(
    () => db.messages.where('contractId').equals(contract.id).sortBy('createdAt'),
    [contract.id],
  ) ?? []

  const impliedTakerStake = Math.ceil(contract.makerStake * (100 - contract.confidence) / contract.confidence)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
        <span>←</span> all contracts
      </button>

      <div className="border border-white/10 rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium leading-snug flex-1">{contract.marketQuestion}</p>
          <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_COLOR[contract.status] ?? 'text-white/40 bg-white/5'}`}>
            {STATUS_LABEL[contract.status] ?? contract.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="text-white/30">your role</p>
            <p className="text-white/70 font-medium">{contract.role}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30">your side</p>
            <p className={`font-medium ${contract.side === 'YES' ? 'text-green-400' : 'text-red-400'}`}>{contract.side}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30">maker stake</p>
            <p className="font-mono text-white/70">{contract.makerStake.toLocaleString()} sats</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30">taker stake</p>
            <p className="font-mono text-white/70">{impliedTakerStake.toLocaleString()} sats</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30">confidence</p>
            <p className="font-mono text-white/70">{contract.confidence}%</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-white/30">resolves at</p>
            <p className="font-mono text-white/70">block {contract.resolutionBlockheight.toLocaleString()}</p>
          </div>
          {contract.counterpartyPubkey && (
            <div className="col-span-2 space-y-0.5">
              <p className="text-white/30">counterparty</p>
              <p className="font-mono text-white/60">{truncate(contract.counterpartyPubkey)}</p>
            </div>
          )}
          {contract.fundingTxid && (
            <div className="col-span-2 space-y-0.5">
              <p className="text-white/30">funding tx</p>
              <p className="font-mono text-white/60 break-all text-[10px]">{contract.fundingTxid}</p>
            </div>
          )}
        </div>
      </div>

      {/* Taker UTXO info (visible to maker when take_received) */}
      {contract.role === 'maker' && contract.takerInput && (
        <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-4 space-y-3">
          <p className="text-xs text-yellow-400 font-medium">take request received</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-white/40">taker pubkey</span>
              <span className="font-mono text-white/60">{truncate(contract.counterpartyPubkey)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">taker utxo</span>
              <span className="font-mono text-white/60">{contract.takerInput.txid.slice(0, 10)}…:{contract.takerInput.vout}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">taker amount</span>
              <span className="font-mono text-white/60">{contract.takerInput.amount.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">change address</span>
              <span className="font-mono text-white/60 text-[10px]">{contract.takerChangeAddress}</span>
            </div>
          </div>
          <p className="text-[10px] text-white/20">PSBT construction coming soon — you'll sign your input here and send it to the taker</p>
        </div>
      )}

      {/* PSBT received (visible to taker) */}
      {contract.role === 'taker' && contract.fundingPsbt && (
        <div className="border border-blue-400/20 bg-blue-400/5 rounded-lg p-4 space-y-2">
          <p className="text-xs text-blue-400 font-medium">funding psbt received</p>
          <p className="font-mono text-[10px] text-white/30 break-all">{contract.fundingPsbt.slice(0, 80)}…</p>
          <p className="text-[10px] text-white/20">PSBT verification + signing coming soon</p>
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-white/30 uppercase tracking-wider">messages</p>
          {messages.map((msg: Message) => (
            <div
              key={msg.id}
              className={`rounded-lg px-4 py-3 text-xs space-y-1 ${msg.direction === 'out' ? 'bg-white/5 border border-white/10' : 'bg-white/3 border border-white/5'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-white/40">{msg.type}</span>
                <div className="flex items-center gap-2 text-white/20">
                  <span>{msg.direction === 'out' ? 'sent' : 'received'}</span>
                  <span>{timeAgo(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function InboxPage() {
  const contracts = useLiveQuery(
    () => db.contracts.orderBy('updatedAt').reverse().toArray(),
  ) ?? []

  const [selected, setSelected] = useState<Contract | null>(null)

  if (selected) {
    return (
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <ContractDetail contract={selected} onBack={() => setSelected(null)} />
      </main>
    )
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">inbox</h1>
        <p className="text-white/40 text-sm">your active and pending contracts</p>
      </div>

      {contracts.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-20">
          no contracts yet — post an offer or take one
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map(contract => {
            const impliedTakerStake = Math.ceil(contract.makerStake * (100 - contract.confidence) / contract.confidence)
            const totalPot = contract.makerStake + impliedTakerStake
            return (
              <button
                key={contract.id}
                onClick={() => setSelected(contract)}
                className="w-full text-left border border-white/10 rounded-lg px-4 py-3.5 hover:border-white/25 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-snug flex-1 line-clamp-1">{contract.marketQuestion}</p>
                  <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_COLOR[contract.status] ?? 'text-white/40 bg-white/5'}`}>
                    {STATUS_LABEL[contract.status] ?? contract.status}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2 text-xs text-white/30">
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${contract.side === 'YES' ? 'text-green-400/70' : 'text-red-400/70'}`}>
                      {contract.side}
                    </span>
                    <span>{contract.role}</span>
                    <span className="font-mono">{totalPot.toLocaleString()} sats pot</span>
                  </div>
                  <span>{timeAgo(contract.updatedAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
