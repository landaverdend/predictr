import { useState } from 'react'
import { type Contract } from '../../db'
import { Field } from './Field'
import { AcceptTakerModal } from './AcceptTakerModal'
import { ClaimModal } from './ClaimModal'
import { useElectrum } from '../../hooks/useElectrum'
import { signAndBroadcastFunding, refundFunding } from '../../lib/spend'
import { REFUND_DELAY } from '../../lib/utils'
import { Avatar } from '../Avatar'
import { useProfiles } from '../../hooks/useProfiles'

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

export function ContractDetail({ contract, onBack }: { contract: Contract; onBack: () => void }) {
  const counterpartyPubkeys = contract.counterpartyPubkey ? [contract.counterpartyPubkey] : []
  const profiles = useProfiles(counterpartyPubkeys)
  const counterpartyProfile = contract.counterpartyPubkey ? profiles.get(contract.counterpartyPubkey) : undefined

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
    ? (won === true ? 'text-positive bg-positive/10' : won === false ? 'text-negative bg-negative/10' : 'text-ink/40 bg-ink/5')
    : (STATUS_COLOR[contract.status] ?? 'text-ink/40 bg-ink/5')

  return (
    <>
      <div className="space-y-5">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
          ← all contracts
        </button>

        {/* Header */}
        <div className="border border-ink/10 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium leading-snug flex-1">{contract.marketQuestion}</p>
            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          {/* Our position */}
          <div>
            <p className="text-xs text-ink/30 uppercase tracking-wider mb-2">your position</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="role">{contract.role}</Field>
              <Field label="side">
                <span className={ourSide === 'YES' ? 'text-positive' : 'text-negative'}>{ourSide}</span>
              </Field>
              <Field label="your stake" mono>{ourStake.toLocaleString()} sats</Field>
              <Field label="win amount" mono>
                <span className="text-positive">{totalPot.toLocaleString()} sats</span>
              </Field>
            </div>
          </div>

          {/* Deal terms */}
          <div>
            <p className="text-xs text-ink/30 uppercase tracking-wider mb-2">deal</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="maker stake" mono>{contract.makerStake.toLocaleString()} sats</Field>
              <Field label="taker stake" mono>{contract.takerStake.toLocaleString()} sats</Field>
              <Field label="total pot" mono>{totalPot.toLocaleString()} sats</Field>
              <Field label="confidence" mono>{contract.confidence}%</Field>
              <Field label="resolves at block" mono>{contract.resolutionBlockheight.toLocaleString()}</Field>
              {contract.fundingTxid && (
                <Field label="funding tx" mono span2>
                  <span className="break-all text-[10px] text-ink/50">{contract.fundingTxid}</span>
                </Field>
              )}
            </div>
          </div>
        </div>

        {/* Taker request */}
        {contract.role === 'maker' && contract.status === 'take_received' && contract.takerInput && (
          <div className="border border-caution/20 bg-caution/5 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-caution font-medium uppercase tracking-wider">taker request</p>
              <button
                onClick={() => setShowAccept(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-positive rounded-lg hover:bg-positive/80 transition-colors"
              >
                accept
              </button>
            </div>

            <div>
              <p className="text-xs text-ink/30 uppercase tracking-wider mb-2">taker identity</p>
              <div className="flex items-center gap-3">
                {contract.counterpartyPubkey && <Avatar pubkey={contract.counterpartyPubkey} size="md" />}
                <div className="min-w-0">
                  {counterpartyProfile?.name && (
                    <p className="text-xs text-ink/70 font-medium truncate">{counterpartyProfile.name}</p>
                  )}
                  <p className="text-[10px] font-mono text-ink/40 break-all">{contract.counterpartyPubkey}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-ink/30 uppercase tracking-wider mb-2">their input</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="txid" mono span2>
                  <span className="break-all text-ink/60 text-[10px]">{contract.takerInput.txid}</span>
                </Field>
                <Field label="vout" mono>{contract.takerInput.vout}</Field>
                <Field label="amount" mono>{contract.takerInput.amount.toLocaleString()} sats</Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-ink/30 uppercase tracking-wider mb-2">their addresses</p>
              <Field label="payout / change address" mono>
                <span className="break-all text-ink/60">{contract.takerChangeAddress}</span>
              </Field>
            </div>
          </div>
        )}

        {/* Awaiting taker */}
        {contract.role === 'maker' && !contract.takerInput && contract.status === 'offer_pending' && (
          <div className="border border-ink/10 rounded-lg p-4 text-xs text-ink/30 text-center">
            waiting for a taker to respond…
          </div>
        )}

        {/* PSBT received (taker) */}
        {contract.role === 'taker' && contract.fundingPsbt && contract.status === 'psbt_sent' && (
          <div className="border border-brand/20 bg-brand/5 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-brand font-medium uppercase tracking-wider">funding psbt received</p>
              <button
                onClick={handleSignAndBroadcast}
                disabled={signing}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {signing ? 'broadcasting…' : 'sign & broadcast'}
              </button>
            </div>
            <p className="font-mono text-[10px] text-ink/30 break-all">{contract.fundingPsbt.slice(0, 120)}…</p>
            {signError && <p className="text-xs text-negative">{signError}</p>}
          </div>
        )}

        {/* Claim winnings */}
        {won === true && !contract.claimTxid && (
          <div className="border border-positive/20 bg-positive/5 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-positive font-medium uppercase tracking-wider">winnings ready</p>
                <p className="text-xs text-ink/30 mt-0.5">{totalPot.toLocaleString()} sats available</p>
              </div>
              <button
                onClick={() => setShowClaim(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-positive rounded-lg hover:bg-positive/80 transition-colors"
              >
                claim
              </button>
            </div>
          </div>
        )}
        {won === true && contract.claimTxid && (
          <div className="border border-ink/10 rounded-lg p-4 text-xs space-y-1">
            <p className="text-ink/40 uppercase tracking-wider">claimed</p>
            <p className="font-mono text-ink/40 break-all text-[10px]">{contract.claimTxid}</p>
          </div>
        )}

        {/* Refund */}
        {contract.status === 'funded' && (
          <div className="border border-ink/10 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-ink/50 font-medium uppercase tracking-wider">refund</p>
                <p className="text-xs text-ink/30 mt-0.5">
                  spendable after block {(contract.resolutionBlockheight + REFUND_DELAY).toLocaleString()}
                </p>
              </div>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="px-3 py-1.5 text-xs font-medium text-ink bg-elevated border border-ink/20 rounded-lg hover:bg-elevated/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {refunding ? 'broadcasting…' : 'claim refund'}
              </button>
            </div>
            {refundError && <p className="text-xs text-negative">{refundError}</p>}
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
