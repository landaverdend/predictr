import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RelayProvider } from './context/RelayContext'
import Navbar from './components/Navbar'
import MarketsPage from './pages/MarketsPage'
import OraclePage from './pages/OraclePage'
import InboxPage from './pages/InboxPage'
import { useDMs } from './hooks/useDMs'

function DmListener() {
  const [pubkey, setPubkey] = useState<string | null>(null)

  useEffect(() => {
    window.nostr?.getPublicKey().then(setPubkey).catch(() => {})
  }, [])

  useDMs(pubkey)
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RelayProvider url="ws://kratomstr.io:7777">
        <div className="min-h-screen bg-black text-white flex flex-col">
          <Navbar />
          <DmListener />
          <Routes>
            <Route path="/" element={<MarketsPage />} />
            <Route path="/oracle" element={<OraclePage />} />
            <Route path="/inbox" element={<InboxPage />} />
          </Routes>
        </div>
      </RelayProvider>
    </BrowserRouter>
  )
}
