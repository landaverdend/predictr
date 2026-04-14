import { useState, useRef } from 'react'
import { type Contract } from '../../db'
import { Field } from './Field'
import { useElectrum } from '../../hooks/useElectrum'
import type { ElectrumUTXO } from '../../lib/electrum'

const FEE_BUFFER = 2000

function pickUtxo(utxos: ElectrumUTXO[], required: number): ElectrumUTXO | null {
  const enough = utxos.filter(u => u.value >= required + FEE_BUFFER)
  if (enough.length === 0) return null
  return enough.reduce((a, b) => a.value <= b.value ? a : b)
}

// ── shared primitives ─────────────────────────────────────────────────────────

function AddressInput({ label, value, onChange, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-white/40">{label}</label>
        {hint}
      </div>
      <input
        type="text"
        placeholder="bcrt1q..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-xs font-mono placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
      />
    </div>
  )
}

function UtxoCard({ utxo, stake }: { utxo: ElectrumUTXO; stake: number }) {
  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 space-y-1.5 text-xs">
      <p className="text-white/30 mb-1">UTXO selected</p>
      <div className="flex justify-between">
        <span className="text-white/40">txid</span>
        <span className="font-mono text-white/60">{utxo.tx_hash.slice(0, 10)}…:{utxo.tx_pos}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-white/40">amount</span>
        <span className="font-mono text-white/70">{utxo.value.toLocaleString()} sats</span>
      </div>
      <div className="flex justify-between">
        <span className="text-white/40">change back</span>
        <span className="font-mono text-white/70">~{(utxo.value - stake - FEE_BUFFER).toLocaleString()} sats</span>
      </div>
    </div>
  )
}

function ModalActions({ onCancel, onConfirm, confirmLabel, disabled }: {
  onCancel: () => void
  onConfirm?: () => void
  confirmLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2.5 text-sm text-white/40 border border-white/10 rounded-lg hover:border-white/25 hover:text-white/60 transition-colors"
      >
        cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 px-4 py-2.5 text-sm font-medium text-black bg-green-400 rounded-lg hover:bg-green-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {confirmLabel}
      </button>
    </div>
  )
}

// ── step 1: review taker ──────────────────────────────────────────────────────

function ReviewStep({ contract, onCancel, onAccept }: {
  contract: Contract
  onCancel: () => void
  onAccept: () => void
}) {
  const totalPot = contract.makerStake + contract.takerStake
  return (
    <div className="space-y-4">
      <div className="border border-white/10 rounded-lg p-4 space-y-3">
        <p className="text-xs text-white/30 uppercase tracking-wider">contract</p>
        <p className="text-sm font-medium leading-snug">{contract.marketQuestion}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="your stake" mono>{contract.makerStake.toLocaleString()} sats</Field>
          <Field label="taker stake" mono>{contract.takerStake.toLocaleString()} sats</Field>
          <Field label="total pot" mono>
            <span className="text-green-400">{totalPot.toLocaleString()} sats</span>
          </Field>
          <Field label="your side">
            <span className={contract.side === 'YES' ? 'text-green-400' : 'text-red-400'}>{contract.side}</span>
          </Field>
        </div>
      </div>

      {contract.takerInput && (
        <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-4 space-y-2 text-xs">
          <p className="text-yellow-400 uppercase tracking-wider mb-2">taker</p>
          <Field label="pubkey" mono>
            <span className="break-all text-white/60">{contract.counterpartyPubkey}</span>
          </Field>
          <Field label="input" mono>
            <span className="break-all text-white/60 text-[10px]">
              {contract.takerInput.txid}:{contract.takerInput.vout}
            </span>
          </Field>
          <Field label="amount" mono>{contract.takerInput.amount.toLocaleString()} sats</Field>
          <Field label="payout address" mono>
            <span className="break-all text-white/60">{contract.takerChangeAddress}</span>
          </Field>
        </div>
      )}

      <ModalActions onCancel={onCancel} onConfirm={onAccept} confirmLabel="accept →" />
    </div>
  )
}

// ── step 2: maker funding inputs ──────────────────────────────────────────────

type UtxoStatus = 'idle' | 'loading' | 'found' | 'error'

function FundStep({ contract, onCancel, onConfirm }: {
  contract: Contract
  onCancel: () => void
  onConfirm: (utxo: ElectrumUTXO, changeAddress: string, winAddress: string) => void
}) {
  const { clientRef, ready: electrumReady } = useElectrum()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [fundingAddress, setFundingAddress] = useState('')
  const [changeAddress, setChangeAddress] = useState('')
  const [winAddress, setWinAddress] = useState('')
  const [utxoStatus, setUtxoStatus] = useState<UtxoStatus>('idle')
  const [utxoError, setUtxoError] = useState('')
  const [selectedUtxo, setSelectedUtxo] = useState<ElectrumUTXO | null>(null)

  const totalPot = contract.makerStake + contract.takerStake

  function handleFundingAddressChange(value: string) {
    setFundingAddress(value)
    setSelectedUtxo(null)
    setUtxoStatus('idle')
    setUtxoError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) return

    debounceRef.current = setTimeout(async () => {
      const client = clientRef.current
      if (!client) { setUtxoError('electrum not connected'); setUtxoStatus('error'); return }
      setUtxoStatus('loading')
      try {
        const utxos = await client.getUTXOs(value.trim())
        const best = pickUtxo(utxos, contract.makerStake)
        if (!best) {
          const total = utxos.reduce((s, u) => s + u.value, 0)
          setUtxoError(
            utxos.length === 0
              ? 'no UTXOs found at this address'
              : `largest UTXO (${Math.max(...utxos.map(u => u.value)).toLocaleString()} sats) is less than required ${(contract.makerStake + FEE_BUFFER).toLocaleString()} sats — total: ${total.toLocaleString()} sats`
          )
          setUtxoStatus('error')
        } else {
          setSelectedUtxo(best)
          setUtxoStatus('found')
        }
      } catch (e) {
        setUtxoError(e instanceof Error ? e.message : 'lookup failed')
        setUtxoStatus('error')
      }
    }, 600)
  }

  const canConfirm = utxoStatus === 'found' && !!selectedUtxo && changeAddress.trim() && winAddress.trim()

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40">
        You stake <span className="text-white/70 font-mono">{contract.makerStake.toLocaleString()} sats</span> to win <span className="text-green-400 font-mono">{totalPot.toLocaleString()} sats</span>.
      </p>

      <AddressInput
        label="funding address"
        value={fundingAddress}
        onChange={handleFundingAddressChange}
        hint={!electrumReady ? <span className="text-[10px] text-yellow-400/70">electrum connecting…</span> : undefined}
      />

      {utxoStatus === 'loading' && <p className="text-xs text-white/30">looking up UTXOs…</p>}
      {utxoStatus === 'error' && <p className="text-xs text-red-400">{utxoError}</p>}
      {utxoStatus === 'found' && selectedUtxo && (
        <UtxoCard utxo={selectedUtxo} stake={contract.makerStake} />
      )}

      <AddressInput label="change address" value={changeAddress} onChange={setChangeAddress} />
      <AddressInput label="win address" value={winAddress} onChange={setWinAddress} />

      <ModalActions
        onCancel={onCancel}
        onConfirm={() => selectedUtxo && onConfirm(selectedUtxo, changeAddress.trim(), winAddress.trim())}
        confirmLabel="confirm"
        disabled={!canConfirm}
      />
    </div>
  )
}

// ── modal shell ───────────────────────────────────────────────────────────────

type Step = 'review' | 'fund'

export function AcceptTakerModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [step, setStep] = useState<Step>('review')

  const title = step === 'review' ? 'accept taker request' : 'your funding details'

  function handleConfirm(_utxo: ElectrumUTXO, _changeAddress: string, _winAddress: string) {
    // TODO: build and send funding PSBT
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#111] border border-white/10 rounded-xl p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === 'fund' && (
              <button onClick={() => setStep('review')} className="text-white/30 hover:text-white/60 transition-colors text-sm">←</button>
            )}
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none">×</button>
        </div>

        {step === 'review' && (
          <ReviewStep contract={contract} onCancel={onClose} onAccept={() => setStep('fund')} />
        )}
        {step === 'fund' && (
          <FundStep contract={contract} onCancel={onClose} onConfirm={handleConfirm} />
        )}

      </div>
    </div>
  )
}
