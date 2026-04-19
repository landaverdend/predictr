import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RelayProvider } from './context/RelayContext'
import Navbar from './components/Navbar'
import MarketsPage from './pages/MarketsPage'
import OraclePage from './pages/OraclePage'
import InboxPage from './pages/InboxPage'
import WalletPage from './pages/WalletPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <RelayProvider url="ws://kratomstr.io:7777">
        <div className="min-h-screen bg-base text-ink flex flex-col">
          <Navbar />
          <Routes>
            <Route path="/" element={<MarketsPage />} />
            <Route path="/oracle" element={<OraclePage />} />
            <Route path="/inbox" element={<Navigate to="/contracts" replace />} />
            <Route path="/contracts" element={<InboxPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </RelayProvider>
    </BrowserRouter>
  )
}
