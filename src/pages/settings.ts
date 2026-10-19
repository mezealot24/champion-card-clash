// Player settings kept on this device (no player accounts yet). Every screen that reads them uses useGameSettings,
// so a change made in one place (Champion select now, the in-match Settings sheet later) shows up everywhere at once.
import { useCallback, useEffect, useState } from 'react'

export type GameSettings = {
  /** Turn timer on/off. When it runs out you Block (or the first legal action if Block is off). */
  timer: boolean
  /** Seconds per turn */
  timerSec: number
}

/** Game Designer pick: 15 s (playtester asked for 10). Q can change the default here. */
export const TIMER_DEFAULT_SEC = 15
export const TIMER_CHOICES = [10, 15, 20, 30]
export const DEFAULT_SETTINGS: GameSettings = { timer: true, timerSec: TIMER_DEFAULT_SEC }

const KEY = 'ccc-settings'
const EVENT = 'ccc-settings'

export function readSettings(): GameSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GameSettings>
    return {
      timer: typeof raw.timer === 'boolean' ? raw.timer : DEFAULT_SETTINGS.timer,
      timerSec: TIMER_CHOICES.includes(Number(raw.timerSec)) ? Number(raw.timerSec) : DEFAULT_SETTINGS.timerSec,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useGameSettings(): [GameSettings, (patch: Partial<GameSettings>) => void] {
  const [s, setS] = useState(readSettings)
  useEffect(() => {
    const sync = () => setS(readSettings())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const update = useCallback((patch: Partial<GameSettings>) => {
    const next = { ...readSettings(), ...patch }
    setS(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* private window: the setting lasts until the page closes */
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [s, update]
}

// ---- Tutorial progress ----
const TUTORIAL_KEY = 'ccc-tutorial-done'
export const tutorialDone = () => {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}
export const markTutorialDone = () => {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1')
  } catch {
    /* not remembered; the tutorial button just stays highlighted */
  }
}
