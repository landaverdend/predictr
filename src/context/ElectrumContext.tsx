import { createContext, useContext, useEffect, useState } from 'react'
import { ElectrumWS } from '../lib/electrum'
import { db } from '../db'

const ELECTRUM_KEY = 'electrum_url'
export const DEFAULT_ELECTRUM_URL = 'ws://nigiri.kratom.io:5050/electrum'

type ElectrumContextValue = {
  client: ElectrumWS | null
  url: string
  error: string | null
  blockHeight: number | null
  saveUrl: (url: string) => Promise<void>
}

const ElectrumContext = createContext<ElectrumContextValue | null>(null)

export function ElectrumProvider({ children }: { children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null)
  const [client, setClient] = useState<ElectrumWS | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blockHeight, setBlockHeight] = useState<number | null>(null)

  // Load URL from DB on mount
  useEffect(() => {
    db.settings.get(ELECTRUM_KEY).then(saved => {
      setUrl(saved?.value as string ?? DEFAULT_ELECTRUM_URL)
    })
  }, [])

  // Connect whenever URL changes
  useEffect(() => {
    if (!url) return
    const instance = new ElectrumWS(url)
    setClient(null)
    setError(null)
    instance.connect()
      .then(() => {
        setClient(instance)
        setError(null)
        // blockchain.headers.subscribe returns current tip AND sends push on new blocks
        instance.onNotification('blockchain.headers.subscribe', (params) => {
          const tip = Array.isArray(params) ? params[0] : params
          if (tip && typeof tip === 'object' && 'height' in tip) {
            setBlockHeight((tip as { height: number }).height)
          }
        })
        instance.getBlockHeight().then(setBlockHeight).catch(() => {})
      })
      .catch(e => { setError(e.message); setClient(null) })
    return () => {
      instance.close()
      setClient(null)
    }
  }, [url])

  async function saveUrl(newUrl: string) {
    await db.settings.put({ key: ELECTRUM_KEY, value: newUrl })
    setUrl(newUrl)
  }

  return (
    <ElectrumContext.Provider value={{ client, url: url ?? DEFAULT_ELECTRUM_URL, error, blockHeight, saveUrl }}>
      {children}
    </ElectrumContext.Provider>
  )
}

export function useElectrumContext() {
  const ctx = useContext(ElectrumContext)
  if (!ctx) throw new Error('useElectrumContext must be used within ElectrumProvider')
  return ctx
}
