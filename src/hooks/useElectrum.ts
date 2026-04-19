import { useEffect, useState } from 'react'
import { ElectrumWS } from '../lib/electrum'

const ELECTRUM_URL = 'ws://nigiri.kratom.io:5050/electrum'

export function useElectrum() {
  const [client, setClient] = useState<ElectrumWS | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const instance = new ElectrumWS(ELECTRUM_URL)

    instance.connect()
      .then(() => { setClient(instance); setError(null) })
      .catch(e => setError(e.message))

    return () => {
      instance.close()
      setClient(null)
    }
  }, [])

  return { client, error }
}
