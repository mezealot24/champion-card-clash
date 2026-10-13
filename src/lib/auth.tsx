import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppRole } from './database.types'

type AuthState = { session: Session | null; role: AppRole | null; loading: boolean }

const AuthContext = createContext<AuthState>({ session: null, role: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, role: null, loading: true })

  useEffect(() => {
    async function load(session: Session | null) {
      if (!session) return setState({ session: null, role: null, loading: false })
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setState({ session, role: data?.role ?? null, loading: false })
    }
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // defer: calling supabase inside this callback can deadlock the auth lock
      setTimeout(() => load(session), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
