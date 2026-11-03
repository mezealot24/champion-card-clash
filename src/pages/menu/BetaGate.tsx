// Access-code screen for the Closed Beta (see lib/beta.ts). Shown before the game loads when VITE_BETA_CODE is set.
import { useState } from 'react'
import { t, useLang } from '../../i18n'
import { LangToggle } from '../../i18n/LangToggle'
import { buildLabel, tryBetaCode } from '../../lib/beta'
import './menu.css'

export function BetaGate(props: { onUnlock: () => void }) {
  useLang()
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tryBetaCode(code)) props.onUnlock()
    else setWrong(true)
  }
  return (
    <div className="beta-gate">
      <h1 className="tm-logo">
        <span>Champion</span>
        <span>Card Clash</span>
      </h1>
      <form className="tm-settings" onSubmit={submit}>
        <h2>{t('Closed Beta')}</h2>
        <p>{t('This test is invite only. Enter the access code from the tester group.')}</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => (setCode(e.target.value), setWrong(false))}
          placeholder={t('Access code')}
          aria-label={t('Access code')}
          autoCapitalize="characters"
          autoComplete="off"
        />
        {wrong && <p className="error">{t('Wrong code. Check the tester group post.')}</p>}
        <button type="submit" className="tm-small">{t('Enter')}</button>
        <LangToggle />
      </form>
      <small className="tm-build">{buildLabel()}</small>
    </div>
  )
}
