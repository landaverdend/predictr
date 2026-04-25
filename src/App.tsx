import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { RelayProvider } from './context/RelayContext'
import { ElectrumProvider } from './context/ElectrumContext'
import { LangProvider } from './context/LangContext'
import { useCheckOffers } from './hooks/useCheckOffers'
import { useWatchFunding } from './hooks/useWatchFunding'
import { useWatchResolution } from './hooks/useWatchResolution'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

import Navbar from './components/Navbar'
import MarketsPage from './pages/MarketsPage'
import OraclePage from './pages/OraclePage'
import InboxPage from './pages/InboxPage'
import WalletPage from './pages/WalletPage'
import SettingsPage from './pages/SettingsPage'
import UserPage from './pages/UserPage'
import MarketPage from './pages/MarketPage'

function AppShell() {
  const contracts = useLiveQuery(() => db.contracts.toArray()) ?? []
  useCheckOffers()
  useWatchFunding(contracts)
  useWatchResolution(contracts)
  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      <Navbar />
          <Routes>
            <Route path="/" element={<MarketsPage />} />
            <Route path="/oracle" element={<OraclePage />} />
            <Route path="/inbox" element={<Navigate to="/contracts" replace />} />
            <Route path="/contracts" element={<InboxPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/user/:pubkey" element={<UserPage />} />
            <Route path="/markets/:marketId" element={<MarketPage />} />
          </Routes>
        </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LangProvider>
        <RelayProvider>
          <ElectrumProvider>
            <AppShell />
          </ElectrumProvider>
        </RelayProvider>
        <Toaster richColors position="top-right" />
      </LangProvider>
    </BrowserRouter>
  )
}
