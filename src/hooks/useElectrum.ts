import { useElectrumContext } from '../context/ElectrumContext'

// Thin wrapper kept for backwards compatibility with all existing call sites
export function useElectrum() {
  const { client, error } = useElectrumContext()
  return { client, error }
}
