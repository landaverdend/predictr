import { useEffect, useRef, useState } from 'react'
import { ElectrumWS } from '../lib/electrum'

const ELECTRUM_URL = 'ws://localhost:5050/electrum'

export function useElectrum() {
  const clientRef = useRef<ElectrumWS | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const client = new ElectrumWS(ELECTRUM_URL)
    clientRef.current = client

    client.connect()
      .then(() => { setReady(true); setError(null) })
      .catch(e => { setError(e.message); setReady(false) })

    return () => {
      client.close()
      clientRef.current = null
      setReady(false)
    }
  }, [])

  return { client: clientRef.current, ready, error }
}
