import { useState } from 'react'
import type { WalletKey } from '../../db'
import type { ElectrumUTXO } from '../../lib/electrum'

function truncateAddr(addr: string) {
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="copy address"
      className={`shrink-0 transition-colors ${copied ? 'text-positive' : 'text-ink/25 hover:text-ink/60'} ${className}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

function KeyRow({ walletKey, utxos }: { walletKey: WalletKey; utxos: ElectrumUTXO[] | undefined }) {
  const confirmed = (utxos ?? []).filter(u => u.height > 0).reduce((s, u) => s + u.value, 0)
  const pending = (utxos ?? []).filter(u => u.height === 0).reduce((s, u) => s + u.value, 0)
  const loading = utxos === undefined

  const balanceEl = loading ? (
    <span className="text-ink/20">…</span>
  ) : confirmed > 0 || pending > 0 ? (
    <span className="flex flex-col items-end gap-0.5">
      {confirmed > 0 && <span className="text-positive">{confirmed.toLocaleString()} sats</span>}
      {pending > 0 && <span className="text-amber-400/80 text-[10px] font-mono">+{pending.toLocaleString()} pending</span>}
    </span>
  ) : (
    <span className="text-ink/20">—</span>
  )

  return (
    <tr className="group border-t border-ink/5 hover:bg-elevated transition-colors">
      <td className="px-3 py-3 font-mono text-[11px] text-ink/30 text-center w-8">{walletKey.id}</td>
      <td className="sm:hidden px-3 py-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-ink/70">{truncateAddr(walletKey.address)}</p>
          <CopyButton text={walletKey.address} />
        </div>
        <p className="font-mono text-xs mt-0.5">{balanceEl}</p>
      </td>
      <td className="hidden sm:table-cell px-3 py-3 font-mono text-xs text-ink/70 break-all">
        <div className="flex items-start gap-2">
          <span>{walletKey.address}</span>
          <CopyButton text={walletKey.address} className="opacity-0 group-hover:opacity-100 mt-0.5" />
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-3 font-mono text-xs text-right whitespace-nowrap">{balanceEl}</td>
    </tr>
  )
}

function SkeletonRow({ idx }: { idx: number }) {
  return (
    <tr className="border-t border-ink/5">
      <td className="px-3 py-3 text-center">
        <div className="w-4 h-3 rounded bg-ink/8 animate-pulse mx-auto" />
      </td>
      <td className="sm:hidden px-3 py-3">
        <div className="h-3 rounded bg-ink/8 animate-pulse" style={{ width: `${55 + (idx % 3) * 10}%` }} />
        <div className="h-2.5 w-16 rounded bg-ink/5 animate-pulse mt-1.5" />
      </td>
      <td className="hidden sm:table-cell px-3 py-3">
        <div className="h-3 rounded bg-ink/8 animate-pulse" style={{ width: `${70 + (idx % 3) * 8}%` }} />
      </td>
      <td className="hidden sm:table-cell px-3 py-3 text-right">
        <div className="h-3 w-16 rounded bg-ink/8 animate-pulse ml-auto" />
      </td>
    </tr>
  )
}

export function AddressTable({ keys, utxosByAddress, hasData, loading }: {
  keys: WalletKey[]
  utxosByAddress: Record<string, ElectrumUTXO[]>
  hasData: boolean
  loading: boolean
}) {
  return (
    <div className="border border-ink/10 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-elevated">
            <th className="px-3 py-2.5 text-center text-xs text-ink/30 uppercase tracking-wider font-normal w-8">#</th>
            <th className="sm:hidden px-3 py-2.5 text-left text-xs text-ink/30 uppercase tracking-wider font-normal">address · balance</th>
            <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs text-ink/30 uppercase tracking-wider font-normal">address</th>
            <th className="hidden sm:table-cell px-3 py-2.5 text-right text-xs text-ink/30 uppercase tracking-wider font-normal">balance</th>
          </tr>
        </thead>
        <tbody>
          {loading && !hasData
            ? Array.from({ length: Math.min(keys.length, 5) }, (_, i) => <SkeletonRow key={i} idx={i} />)
            : keys.map(k => (
                <KeyRow key={k.id} walletKey={k} utxos={hasData ? (utxosByAddress[k.address] ?? []) : undefined} />
              ))
          }
        </tbody>
      </table>
    </div>
  )
}
