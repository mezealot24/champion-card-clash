import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { RequireSuperAdmin } from './components/RequireSuperAdmin'
import { ChampionsPage } from './pages/ChampionsPage'
import { ChampionEditPage } from './pages/ChampionEditPage'
import { ConfigPage } from './pages/ConfigPage'
import { BattlePage } from './pages/BattlePage'

function Header() {
  const { session, role } = useAuth()
  return (
    <header>
      <strong>Champion Card Clash · Admin</strong>
      <nav>
        <NavLink to="/" end>Champions</NavLink>
        <NavLink to="/config">Config</NavLink>
        <NavLink to="/battle">Battle</NavLink>
      </nav>
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
            {/* Battle only reads public game data, so it needs no admin login */}
            <Route path="/battle" element={<BattlePage />} />
            <Route
              path="*"
              element={
                <RequireSuperAdmin>
                  <Routes>
                    <Route path="/" element={<ChampionsPage />} />
                    <Route path="/champions/:id" element={<ChampionEditPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                  </Routes>
                </RequireSuperAdmin>
              }
            />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  )
}
