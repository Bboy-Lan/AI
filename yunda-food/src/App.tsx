import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './lib/profile'
import { AppLayout } from './components/AppLayout'
import { DiscoverPage } from './pages/DiscoverPage'
import { BlindBoxPage } from './pages/BlindBoxPage'
import { MePage } from './pages/MePage'
import { DetailPage } from './pages/DetailPage'
import { PublishPage } from './pages/PublishPage'
import { AdminPage } from './pages/AdminPage'
import { EditItemPage } from './pages/EditItemPage'

export default function App() {
  return (
    <HashRouter>
      <ProfileProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DiscoverPage />} />
            <Route path="/blindbox" element={<BlindBoxPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/item/:id" element={<DetailPage />} />
            <Route path="/publish" element={<PublishPage />} />
            <Route path="/my-items/:id/edit" element={<EditItemPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ProfileProvider>
    </HashRouter>
  )
}
