import { useState } from 'react'
import { type Contract } from '../../db'
import { Field } from './Field'
import { AcceptTakerModal } from './AcceptTakerModal'
import { ClaimModal } from './ClaimModal'
import { useElectrum } from '../../hooks/useElectrum'
import { signAndBroadcastFunding, refundFunding } from '../../lib/spend'
import { REFUND_DELAY } from '../../lib/utils'

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

export function ContractDetail({ contract, onBack }: { contract: Contract; onBack: () => void }) {
  const [showAccept, setShowAccept] = useState(false)
  const [showClaim, setShowClaim] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState('')
  const { client } = useElectrum()

  async function handleSignAndBroadcast() {
    if (!client) { setSignError('electrum not connected'); return }
    setSigning(true)
    setSignError('')
    try {
      await signAndBroadcastFunding(contract, client)
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'failed')
    } finally {
      setSigning(false)
    }
  }

  async function handleRefund() {
    if (!client) { setRefundError('electrum not connected'); return }
    setRefunding(true)
    setRefundError('')
    try {
      await refundFunding(contract, client)
    } catch (e) {
      setRefundError(e instanceof Error ? e.message : 'failed')
    } finally {
      setRefunding(false)
    }
  }

  const takerSide = contract.side === 'YES' ? 'NO' : 'YES'
  const ourSide = contract.role === 'maker' ? contract.side : takerSide
  const ourStake = contract.role === 'maker' ? contract.makerStake : contract.takerStake
  const totalPot = contract.makerStake + contract.takerStake
  const won = contract.status === 'resolved' && contract.outcome
    ? ourSide === contract.outcome
    : null

  const statusLabel = contract.status === 'resolved'
    ? (won === true ? 'won' : won === false ? 'lost' : 'resolved')
    : (STATUS_LABEL[contract.status] ?? contract.status)
  const statusColor = contract.status === 'resolved'
    ? (won === true ? 'text-green-400 bg-green-400/10' : won === false ? 'text-red-400 bg-red-400/10' : 'text-white/40 bg-white/5')
    : (STATUS_COLOR[contract.status] ?? 'text-white/40 bg-white/5')

  return (
    <>
      <div className="space-y-5">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
          ← all contracts
        </button>

        {/* Header */}
        <div className="border border-white/10 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium leading-snug flex-1">{contract.marketQuestion}</p>
            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          {/* Our position */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">your position</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="role">{contract.role}</Field>
              <Field label="side">
                <span className={ourSide === 'YES' ? 'text-green-400' : 'text-red-400'}>{ourSide}</span>
              </Field>
              <Field label="your stake" mono>{ourStake.toLocaleString()} sats</Field>
              <Field label="win amount" mono>
                <span className="text-green-400">{totalPot.toLocaleString()} sats</span>
              </Field>
            </div>
          </div>

          {/* Deal terms */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">deal</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="maker stake" mono>{contract.makerStake.toLocaleString()} sats</Field>
              <Field label="taker stake" mono>{contract.takerStake.toLocaleString()} sats</Field>
              <Field label="total pot" mono>{totalPot.toLocaleString()} sats</Field>
              <Field label="confidence" mono>{contract.confidence}%</Field>
              <Field label="resolves at block" mono>{contract.resolutionBlockheight.toLocaleString()}</Field>
              {contract.fundingTxid && (
                <Field label="funding tx" mono span2>
                  <span className="break-all text-[10px] text-white/50">{contract.fundingTxid}</span>
                </Field>
              )}
            </div>
          </div>
        </div>

        {/* Taker request */}
        {contract.role === 'maker' && contract.status === 'take_received' && contract.takerInput && (
          <div className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-yellow-400 font-medium uppercase tracking-wider">taker request</p>
              <button
                onClick={() => setShowAccept(true)}
                className="px-3 py-1.5 text-xs font-medium text-black bg-green-400 rounded-lg hover:bg-green-300 transition-colors"
              >
                accept
              </button>
            </div>

            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider mb-2">taker identity</p>
              <Field label="pubkey" mono>
                <span className="break-all text-white/60">{contract.counterpartyPubkey}</span>
              </Field>
            </div>

            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider mb-2">their input</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="txid" mono span2>
                  <span className="break-all text-white/60 text-[10px]">{contract.takerInput.txid}</span>
                </Field>
                <Field label="vout" mono>{contract.takerInput.vout}</Field>
                <Field label="amount" mono>{contract.takerInput.amount.toLocaleString()} sats</Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/30 uppercase tracking-wider mb-2">their addresses</p>
              <Field label="payout / change address" mono>
                <span className="break-all text-white/60">{contract.takerChangeAddress}</span>
              </Field>
            </div>
          </div>
        )}

        {/* Awaiting taker */}
        {contract.role === 'maker' && !contract.takerInput && contract.status === 'offer_pending' && (
          <div className="border border-white/10 rounded-lg p-4 text-xs text-white/30 text-center">
            waiting for a taker to respond…
          </div>
        )}

        {/* PSBT received (taker) */}
        {contract.role === 'taker' && contract.fundingPsbt && contract.status === 'psbt_sent' && (
          <div className="border border-blue-400/20 bg-blue-400/5 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-400 font-medium uppercase tracking-wider">funding psbt received</p>
              <button
                onClick={handleSignAndBroadcast}
                disabled={signing}
                className="px-3 py-1.5 text-xs font-medium text-black bg-blue-400 rounded-lg hover:bg-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {signing ? 'broadcasting…' : 'sign & broadcast'}
              </button>
            </div>
            <p className="font-mono text-[10px] text-white/30 break-all">{contract.fundingPsbt.slice(0, 120)}…</p>
            {signError && <p className="text-xs text-red-400">{signError}</p>}
          </div>
        )}
        {/* Claim winnings */}
        {won === true && !contract.claimTxid && (
          <div className="border border-green-400/20 bg-green-400/5 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400 font-medium uppercase tracking-wider">winnings ready</p>
                <p className="text-xs text-white/30 mt-0.5">{(contract.makerStake + contract.takerStake).toLocaleString()} sats available</p>
              </div>
              <button
                onClick={() => setShowClaim(true)}
                className="px-3 py-1.5 text-xs font-medium text-black bg-green-400 rounded-lg hover:bg-green-300 transition-colors"
              >
                claim
              </button>
            </div>
          </div>
        )}
        {won === true && contract.claimTxid && (
          <div className="border border-white/10 rounded-lg p-4 text-xs space-y-1">
            <p className="text-white/40 uppercase tracking-wider">claimed</p>
            <p className="font-mono text-white/40 break-all text-[10px]">{contract.claimTxid}</p>
          </div>
        )}

        {/* Refund */}
        {contract.status === 'funded' && (
          <div className="border border-white/10 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/50 font-medium uppercase tracking-wider">refund</p>
                <p className="text-xs text-white/30 mt-0.5">
                  spendable after block {(contract.resolutionBlockheight + REFUND_DELAY).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="px-3 py-1.5 text-xs font-medium text-black bg-white/80 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {refunding ? 'broadcasting…' : 'claim refund'}
              </button>
            </div>
            {refundError && <p className="text-xs text-red-400">{refundError}</p>}
          </div>
        )}
      </div>

      {showAccept && (
        <AcceptTakerModal contract={contract} onClose={() => setShowAccept(false)} />
      )}
      {showClaim && (
        <ClaimModal contract={contract} onClose={() => setShowClaim(false)} />
      )}
    </>
  )
}
