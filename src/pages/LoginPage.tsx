import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Only this account may sign in; the database enforces it too (auth.users trigger)
const ADMIN_EMAIL = 'wiriya.on@gmail.com'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [status, setStatus] = useState<'idle' | 'busy' | string>('idle')

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) return setStatus('This email is not allowed to sign in.')
    setStatus('busy')
    const { error } = await supabase.auth.signInWithOtp({ email: ADMIN_EMAIL })
    if (error) return setStatus(error.message)
    setStep('code')
    setStatus('idle')
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setStatus('busy')
    const { error } = await supabase.auth.verifyOtp({ email: ADMIN_EMAIL, token: code.trim(), type: 'email' })
    setStatus(error ? error.message : 'idle')
  }

  const error = status !== 'idle' && status !== 'busy' && <p className="error">{status}</p>

  if (step === 'code') {
    return (
      <form className="panel narrow" onSubmit={verify}>
        <h2>Admin sign in</h2>
        <p className="ok">We sent a code to {ADMIN_EMAIL}.</p>
        <label>
          Code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button type="submit" disabled={status === 'busy'}>
          Sign in
        </button>
        <button type="button" className="secondary" onClick={() => setStep('email')}>
          Back
        </button>
        {error}
      </form>
    )
  }

  return (
    <form className="panel narrow" onSubmit={sendCode}>
      <h2>Admin sign in</h2>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit" disabled={status === 'busy'}>
        Send code
      </button>
      {error}
    </form>
  )
}
