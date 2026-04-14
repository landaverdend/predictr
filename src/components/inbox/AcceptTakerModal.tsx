import { useState } from 'react'
import { type Contract } from '../../db'
import { Field } from './Field'

export function AcceptTakerModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const totalPot = contract.makerStake + contract.takerStake

  function handleAccept() {
    setConfirming(true)
    // TODO: construct and send funding PSBT to taker
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md bg-[#111] border border-white/10 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">accept taker request</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none">×</button>
        </div>

        <p className="text-xs text-white/40 leading-relaxed">
          Review the taker's details below. Accepting will lock in this counterparty and trigger PSBT construction.
        </p>

        {/* Market */}
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

        {/* Taker */}
        {contract.takerInput && (
          <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-4 space-y-3">
            <p className="text-xs text-yellow-400 uppercase tracking-wider">taker</p>
            <div className="space-y-2 text-xs">
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
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-white/40 border border-white/10 rounded-lg hover:border-white/25 hover:text-white/60 transition-colors"
          >
            cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={confirming}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-black bg-green-400 rounded-lg hover:bg-green-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirming ? 'accepting…' : 'accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
