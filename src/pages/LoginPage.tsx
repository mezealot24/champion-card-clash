import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | string>('idle')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    })
    setStatus(error ? error.message : 'sent')
  }

  return (
    <form className="panel narrow" onSubmit={submit}>
      <h2>Admin sign in</h2>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit" disabled={status === 'sending'}>
        Send magic link
      </button>
      {status === 'sent' && <p className="ok">Check your inbox for the sign-in link.</p>}
      {status !== 'idle' && status !== 'sending' && status !== 'sent' && <p className="error">{status}</p>}
    </form>
  )
}
