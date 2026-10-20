// Turn timer pill shown over the battle screen. Counts down while the player has to pick; at 0 it calls onTimeout once.
// Restart it for a new turn by changing its key.
import { useEffect, useRef, useState } from 'react'
import { useGameSettings, TIMER_CHOICES } from '../settings'
import './timer.css'

export function TurnTimer({ seconds, running, onTimeout }: { seconds: number; running: boolean; onTimeout: () => void }) {
  const [left, setLeft] = useState(seconds * 1000)
  const [out, setOut] = useState(false)
  const timeout = useRef(onTimeout)
  useEffect(() => {
    timeout.current = onTimeout
  })

  useEffect(() => {
    if (!running || out) return
    let last = performance.now()
    let rest = left
    const id = setInterval(() => {
      const now = performance.now()
      // a hidden tab doesn't eat the player's time
      if (!document.hidden) rest = Math.max(0, rest - (now - last))
      last = now
      setLeft(rest)
      if (rest === 0) {
        clearInterval(id)
        setOut(true)
        timeout.current()
      }
    }, 100)
    return () => clearInterval(id)
    // left is only the starting point when the timer (re)starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, out])

  if (!running && !out) return null
  const sec = Math.ceil(left / 1000)
  const pct = (left / (seconds * 1000)) * 100
  return (
    <div className={`turn-timer${sec <= 5 ? ' low' : ''}${out ? ' out' : ''}`} role="timer" aria-live={sec <= 5 ? 'polite' : 'off'}>
      <i style={{ width: `${pct}%` }} />
      <span>{out ? "Time's up · Block" : `${sec}s`}</span>
    </div>
  )
}

/** On/off switch + seconds, for the Champion select screen and (later) the in-match Settings sheet. */
export function TimerSetting() {
  const [s, set] = useGameSettings()
  return (
    <div className="timer-setting">
      <label className="inline">
        <input type="checkbox" checked={s.timer} onChange={(e) => set({ timer: e.target.checked })} />
        Turn timer
      </label>
      <select value={s.timerSec} disabled={!s.timer} onChange={(e) => set({ timerSec: Number(e.target.value) })} aria-label="Seconds per turn">
        {TIMER_CHOICES.map((n) => (
          <option key={n} value={n}>
            {n} s
          </option>
        ))}
      </select>
      <span className="muted">Out of time = Block</span>
    </div>
  )
}
