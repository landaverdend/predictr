import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  define: {
    // Stub Vite env vars used by config.ts
    'import.meta.env.VITE_BITCOIN_NETWORK': JSON.stringify('regtest'),
    'import.meta.env.VITE_ELECTRUM_URL': JSON.stringify(''),
    'import.meta.env.VITE_DEFAULT_RELAY': JSON.stringify(''),
  },
})
