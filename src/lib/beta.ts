// Closed Beta helpers (2026-11-03). All three are switched by Vercel env vars, so no code change is needed to open,
// close or end the Beta:
//   VITE_BETA_CODE     access code testers type once (empty / unset = no gate, game is open to anyone)
//   VITE_FEEDBACK_URL  link for the "Report a bug" button on the title screen (e.g. a Google Form); unset = hidden
//   VITE_BUILD_LABEL   label next to the version on the title screen; default "Closed Beta"
// The code check runs in the browser, so it keeps out people who only have the link, not someone reading the JS.
// That is enough for a free game whose card data is public read anyway.

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

const env = import.meta.env

/** Shown on the title screen, e.g. "Closed Beta · v0.9.0 · a1b2c3d". Testers quote it in bug reports. */
export function buildLabel(): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
  const commit = typeof __APP_COMMIT__ === 'string' && __APP_COMMIT__ ? __APP_COMMIT__ : 'dev'
  const label = (env.VITE_BUILD_LABEL ?? 'Closed Beta').trim()
  return [label, `v${version}`, commit].filter(Boolean).join(' · ')
}

export const feedbackUrl = (): string | null => (env.VITE_FEEDBACK_URL ?? '').trim() || null

const KEY = 'ccc-beta-code'
const norm = (s: string) => s.trim().toUpperCase()
const betaCode = (): string => norm(env.VITE_BETA_CODE ?? '')

/** True when there is no gate, or this browser already entered the current code. Changing the code locks everyone out again. */
export function betaUnlocked(): boolean {
  const code = betaCode()
  if (!code) return true
  try {
    return localStorage.getItem(KEY) === code
  } catch {
    return false
  }
}

/** Checks a typed code; remembers it in this browser when it matches. */
export function tryBetaCode(input: string): boolean {
  const code = betaCode()
  if (!code || norm(input) !== code) return false
  try {
    localStorage.setItem(KEY, code)
  } catch {
    /* private window: they type it again next visit */
  }
  return true
}
