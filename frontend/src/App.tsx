import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ScannerPage from './pages/ScannerPage'
import ScanProgressPage from './pages/ScanProgressPage'
import FindingsPage from './pages/FindingsPage'
import BugDetailPage from './pages/BugDetailPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ScannerPage />} />
        <Route path="scan/:scanId" element={<ScanProgressPage />} />
        <Route path="scan/:scanId/findings" element={<FindingsPage />} />
        <Route path="scan/:scanId/findings/:findingId" element={<BugDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
