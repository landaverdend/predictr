// Blocks after resolutionBlockheight before CLTV refund paths become spendable (~1 day)
export const REFUND_DELAY = 144

export function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}
