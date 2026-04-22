type Network = { bech32: string; pubKeyHash: number; scriptHash: number; wif: number }

const NETWORKS: Record<string, Network> = {
  regtest: { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  testnet: { bech32: 'tb',   pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  signet:  { bech32: 'tb',   pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  mainnet: { bech32: 'bc',   pubKeyHash: 0x00, scriptHash: 0x05, wif: 0x80 },
}

export const BITCOIN_NETWORK_NAME: string =
  import.meta.env.VITE_BITCOIN_NETWORK ?? 'regtest'

export const BITCOIN_NETWORK: Network =
  NETWORKS[BITCOIN_NETWORK_NAME] ?? NETWORKS.regtest

export const DEFAULT_ELECTRUM_URL: string =
  import.meta.env.VITE_ELECTRUM_URL ?? 'ws://nigiri.kratom.io:5050/electrum'

export const DEFAULT_RELAY: string =
  import.meta.env.VITE_DEFAULT_RELAY ?? 'ws://kratomstr.io:7777'
