/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BITCOIN_NETWORK?: string
  readonly VITE_ELECTRUM_URL?: string
  readonly VITE_DEFAULT_RELAY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
