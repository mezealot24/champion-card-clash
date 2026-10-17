import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { RequireSuperAdmin } from './components/RequireSuperAdmin'
import { ChampionsPage } from './pages/ChampionsPage'
import { ChampionEditPage } from './pages/ChampionEditPage'
import { ConfigPage } from './pages/ConfigPage'
import { BattlePage } from './pages/BattlePage'

// Players only see the game; admin links show for super_admin only
function Header() {
  const { session, role } = useAuth()
  const isAdmin = role === 'super_admin'
  return (
    <header>
      <strong>Champion Card Clash{isAdmin ? ' · Admin' : ''}</strong>
      {isAdmin && (
        <nav>
          <NavLink to="/" end>Battle</NavLink>
          <NavLink to="/admin" end>Champions</NavLink>
          <NavLink to="/admin/config">Config</NavLink>
        </nav>
      )}
      {session && (
        <span className="who">
          {session.user.email} <code>{role}</code>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </span>
      )}
    </header>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <main>
          <Routes>
            {/* Battle only reads public game data, so it needs no login */}
            <Route path="/" element={<BattlePage />} />
            <Route path="/battle" element={<BattlePage />} />
            <Route
              path="/admin/*"
              element={
                <RequireSuperAdmin>
                  <Routes>
                    <Route index element={<ChampionsPage />} />
                    <Route path="champions/:id" element={<ChampionEditPage />} />
                    <Route path="config" element={<ConfigPage />} />
                  </Routes>
                </RequireSuperAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}
