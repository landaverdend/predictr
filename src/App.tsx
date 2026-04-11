import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RelayProvider } from './context/RelayContext'
import Navbar from './components/Navbar'
import MarketsPage from './pages/MarketsPage'
import OraclePage from './pages/OraclePage'

export default function App() {
  return (
    <BrowserRouter>
      <RelayProvider url="ws://localhost:8080">
        <div className="min-h-screen bg-black text-white flex flex-col">
          <Navbar />
          <Routes>
            <Route path="/" element={<MarketsPage />} />
            <Route path="/oracle" element={<OraclePage />} />
          </Routes>
        </div>
      </RelayProvider>
    </BrowserRouter>
  )
}
