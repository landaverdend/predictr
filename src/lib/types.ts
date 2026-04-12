export type TakerInput = {
  txid: string
  vout: number
  amount: number  // sats
}

export type TakeRequest = {
  type: 'take_request'
  taker_pubkey: string
  input: TakerInput
  change_address: string
}
