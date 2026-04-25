/**
 * P2TR transaction vbyte estimates and fee helpers.
 *
 * All sizes are conservative (slightly over-estimate) to avoid under-paying.
 *
 * Funding tx:  2 P2TR keypath inputs + 4 outputs (2 contract P2TR + 2 change P2TR) ≈ 298 vbytes
 * Refund tx:   1 P2TR script (CLTV leaf) + 1 output                                ≈ 138 vbytes
 * Claim tx:    2 P2TR script (preimage leaves) + 1 output                           ≈ 253 vbytes
 */

export const VBYTES = {
  FUNDING: 298,
  REFUND: 138,
  CLAIM: 253,
  SEND_BASE: 96,        // overhead + 1 recipient output + 1 change output
  SEND_PER_INPUT: 58,   // P2TR keypath input
} as const

/** Minimum fee rate we'll ever use (protects against fee API returning 0). */
export const MIN_FEE_RATE = 1   // sat/vbyte

/** Each party's share of the funding tx fee. */
export function fundingFeePerParty(feeRate: number): number {
  return Math.ceil((VBYTES.FUNDING * Math.max(feeRate, MIN_FEE_RATE)) / 2)
}

/** Fee for a single-input refund tx. */
export function refundFee(feeRate: number): number {
  return Math.ceil(VBYTES.REFUND * Math.max(feeRate, MIN_FEE_RATE))
}

/** Fee for a two-input claim tx (winner takes both outputs). */
export function claimFee(feeRate: number): number {
  return Math.ceil(VBYTES.CLAIM * Math.max(feeRate, MIN_FEE_RATE))
}

/** Fee for a plain wallet-to-address send with a given number of inputs. */
export function sendFee(numInputs: number, feeRate: number): number {
  const vbytes = VBYTES.SEND_BASE + numInputs * VBYTES.SEND_PER_INPUT
  return Math.ceil(vbytes * Math.max(feeRate, MIN_FEE_RATE))
}
