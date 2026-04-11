import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import MarketsPage from './pages/MarketsPage'
import OraclePage from './pages/OraclePage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-black text-white flex flex-col">
        <Navbar />
        <Routes>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/oracle" element={<OraclePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
