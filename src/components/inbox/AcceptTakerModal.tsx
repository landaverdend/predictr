import { useState } from 'react'
import { type Contract } from '../../db'
import { Field } from './Field'
import { useRelayContext } from '../../context/RelayContext'
import { useWallet, type WalletUTXO } from '../../hooks/useWallet'
import { sendFundingPsbt } from '../../lib/acceptTaker'
import { ChangeAddressPicker } from './ChangeAddressPicker'

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

function FundStep({ contract, onCancel, onConfirm }: {
  contract: Contract
  onCancel: () => void
  onConfirm: (funding: WalletUTXO, changeAddress: string) => void
}) {
  const { allUtxos, keys, utxosByAddress, loading } = useWallet()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [changeAddress, setChangeAddress] = useState('')

  const eligible = allUtxos().filter(w => w.utxo.value >= contract.makerStake + 2000)
  const selected = eligible.find(w => `${w.utxo.tx_hash}:${w.utxo.tx_pos}` === selectedId) ?? null

  const totalPot = contract.makerStake + contract.takerStake

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40">
        You stake <span className="text-white/70 font-mono">{contract.makerStake.toLocaleString()} sats</span> to win <span className="text-green-400 font-mono">{totalPot.toLocaleString()} sats</span>.
      </p>

      <div className="space-y-2">
        <p className="text-xs text-white/40">select UTXO</p>
        {loading && <p className="text-xs text-white/30">loading wallet…</p>}
        {!loading && keys.length === 0 && (
          <p className="text-xs text-red-400">no wallet keys — generate one in the wallet tab</p>
        )}
        {!loading && keys.length > 0 && eligible.length === 0 && (
          <p className="text-xs text-red-400">no UTXOs with enough balance — need at least {(contract.makerStake + 2000).toLocaleString()} sats</p>
        )}
        {eligible.map(w => {
          const id = `${w.utxo.tx_hash}:${w.utxo.tx_pos}`
          const active = selectedId === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => { setSelectedId(id); setChangeAddress(w.key.address) }}
              className={`w-full text-left rounded-lg border px-4 py-3 text-xs font-mono transition-colors ${active ? 'border-white/40 bg-white/5' : 'border-white/10 hover:border-white/20'}`}
            >
              <div className="flex justify-between">
                <span className="text-white/40">{w.utxo.tx_hash.slice(0, 10)}…:{w.utxo.tx_pos}</span>
                <span className="text-white/70">{w.utxo.value.toLocaleString()} sats</span>
              </div>
              <div className="text-white/30 mt-0.5">{w.key.address.slice(0, 20)}…</div>
            </button>
          )
        })}
      </div>

      <ChangeAddressPicker
        value={changeAddress}
        onChange={setChangeAddress}
        keys={keys}
        utxosByAddress={utxosByAddress}
        highlightAddress={selected?.key.address}
      />

      <ModalActions
        onCancel={onCancel}
        onConfirm={() => selected && onConfirm(selected, changeAddress.trim())}
        confirmLabel="confirm"
        disabled={!selected || !changeAddress.trim()}
      />
    </div>
  )
}

type Step = 'review' | 'fund'

export function AcceptTakerModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [step, setStep] = useState<Step>('review')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const { publish } = useRelayContext()

  const title = step === 'review' ? 'accept taker request' : 'your funding details'

  async function handleConfirm(funding: WalletUTXO, changeAddress: string) {
    setSending(true)
    setError('')
    try {
      await sendFundingPsbt(publish, contract, { funding, changeAddress })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to send PSBT')
    } finally {
      setSending(false)
    }
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
          <FundStep contract={contract} onCancel={() => setStep('review')} onConfirm={handleConfirm} />
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {sending && <p className="text-xs text-white/40">sending PSBT…</p>}

      </div>
    </div>
  )
}
