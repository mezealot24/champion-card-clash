// Player-facing language (Q 2026-10-26: Thai on the web, English still one tap away). Admin pages stay English.
// The English text is the key: t('Pick a Style') looks it up in th.ts and falls back to English when a line has no
// Thai yet. {name} slots are filled from vars; other {placeholders} (tuning numbers like {TK.sCost}) are left for fillText.
// Card, Style, Oath and Ascendancy names come from the DB / engine and are not translated.
import { useSyncExternalStore } from 'react'
import { TH } from './th'

export type Lang = 'th' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'th', label: 'ไทย' },
  { id: 'en', label: 'EN' },
]

const KEY = 'ccc-lang'
// tests run without a browser and read the English source text
const DEFAULT: Lang = typeof window === 'undefined' ? 'en' : 'th'

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'th' || v === 'en' ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

let lang: Lang = read()
const subs = new Set<() => void>()
const syncDoc = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
syncDoc()

export const getLang = () => lang

export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* private window: the pick lasts until the page closes */
  }
  syncDoc()
  subs.forEach((f) => f())
}

/** Re-render on a language switch. Call it in every component that shows t() text. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    getLang,
    getLang,
  )
}

/** The line in the current language, with {name} slots filled from vars. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = lang === 'th' ? (TH[en] ?? en) : en
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** For tests: run fn in another language, then switch back (storage and subscribers untouched). */
export const withLang = <T>(l: Lang, fn: () => T): T => {
  const was = lang
  lang = l
  try {
    return fn()
  } finally {
    lang = was
  }
}
