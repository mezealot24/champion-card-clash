import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { LoginPage } from '../pages/LoginPage'
import { supabase } from '../lib/supabase'

// UI guard only; the real guard is RLS (is_super_admin) in the database
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session, role, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!session) return <LoginPage />
  if (role !== 'super_admin') {
    return (
      <div className="panel">
        <h2>No access</h2>
        <p>
          {session.user.email} is <code>{role ?? 'unknown'}</code>. Only <code>super_admin</code> can edit game data.
        </p>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }
  return <>{children}</>
}
