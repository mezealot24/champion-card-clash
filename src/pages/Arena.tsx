// Landscape battle screen: board, cards, Champions, and the turn playback.
// The engine resolves a whole turn at once; this screen replays next.events step by step, then shows the new state.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  costOf,
  isEffectMissing,
  legalActions,
  overdriveAdd,
  resourceOf,
  tuningOf,
  STYLES,
  type Action,
  type CardInst,
  type GameState,
  type Side,
  type Status,
  type TurnEvent,
} from '../engine'
import { describeSpec } from '../engine/effects/describe'
import { t, useLang } from '../i18n'
import { LangToggle } from '../i18n/LangToggle'
import { champColor, fighterHTML, type Pose } from './fighters'
import { newChain, strikePose, type ChainCount } from './strikePoses'
import { ComboTracker, CompactFx } from './LearnBits'
import './arena.css'

const W = 800
const H = 390
const SIDES: Side[] = ['p1', 'p2']
const other = (s: Side): Side => (s === 'p1' ? 'p2' : 'p1')
const LABEL_EN: Record<Action, string> = { strike: 'STRIKE', block: 'BLOCK', charge: 'CHARGE' }
const label = (a: Action) => t(LABEL_EN[a])
const BEATS: Record<Action, Action> = { strike: 'charge', charge: 'block', block: 'strike' }
const ACTIONS: { action: Action; label: string; beats: string }[] = [
  { action: 'strike', label: 'Strike', beats: 'beats Charge' },
  { action: 'block', label: 'Block', beats: 'beats Strike' },
  { action: 'charge', label: 'Charge', beats: 'beats Block' },
]
const SPEEDS = [1, 1.5, 2]
/** Signature combo banner time at 1x speed (was 1.3 s, players couldn't read it) */
const BANNER_MS = 3200
/** Banner text per signature combo (champion · pattern). */
/** Juggernaut: Momentum stacks full (6) lights the fighter up. */
const conqMax = (g: GameState, s: Side) => (g.players[s].comboData?.conqueror ?? 0) >= tuningOf(g, s)['BR:2'].conquerorMax
const COMBO_TEXT: Record<string, [string, string]> = {
  'TK:P > K > P': ['SECOND HELPING', 'Heal 10% of your HP'],
  'AS:P > K > S': ['DEATH MARK', 'Every later Strike bursts +50%'],
  'MG:S + S + S': ['SEALED', "Enemy can't Block next turn"],
  'BR:S > P > P': ['GUARD CRUSH', 'Next Strike breaks through Block'],
}
const ICON: Record<string, string> = {
  P: '<svg viewBox="0 0 40 40"><rect x="6" y="12" width="26" height="20" rx="6" fill="currentColor"/><rect x="9" y="6" width="6" height="10" rx="3" fill="currentColor"/><rect x="16" y="5" width="6" height="10" rx="3" fill="currentColor"/><rect x="23" y="6" width="6" height="10" rx="3" fill="currentColor"/></svg>',
  K: '<svg viewBox="0 0 40 40"><path d="M10 4h10v18l12 4v8H8z" fill="currentColor"/></svg>',
  S: '<svg viewBox="0 0 40 40"><path d="M20 2l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="currentColor"/></svg>',
}

type VCard = { card: CardInst; spent?: boolean; gone?: string }
type View = Record<Side, { hp: number; field: VCard[] }>
const viewOf = (g: GameState): View => ({
  p1: { hp: g.players.p1.hp, field: g.players.p1.hand.map((card) => ({ card })) },
  p2: { hp: g.players.p2.hp, field: g.players.p2.hand.map((card) => ({ card })) },
})
type Tokens = { p1?: Action; p2?: Action; shown: boolean; verdict: string; lose?: Side }

export type Turn = { prev: GameState; next: GameState; actions: Record<Side, Action> }

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const readSpeed = () => {
  try {
    const v = Number(localStorage.getItem('ccc-speed'))
    return SPEEDS.includes(v) ? v : 1.5
  } catch {
    return 1.5
  }
}

export function Arena(props: {
  game: GameState
  turn: Turn | null
  names: Record<Side, string>
  styleNames: Record<Side, string>
  /** full Style text, shown when a player taps the Style name */
  styleTexts?: Record<Side, string>
  /** extra controls in the in-match Settings sheet (e.g. the turn timer switch) */
  settingsExtra?: React.ReactNode
  onAction: (a: Action) => void
  onDone: () => void
  /** no Play again button when absent (online matches) */
  onRestart?: () => void
  onQuit: () => void
  /** what the opponent is called on screen (default AI) */
  foe?: string
  /** a line shown over the board (opponent's taunt, "waiting for opponent"...); a taunt fades out by itself */
  banner?: string
  bannerFades?: boolean
  /** action buttons stay disabled while true (waiting on the opponent's pick) */
  busy?: boolean
}) {
  useLang()
  const { game, turn, names, styleNames } = props
  const foe = props.foe ?? t('AI')
  const stageRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  const poseTimers = useRef(new WeakMap<Element, number>())
  const [scale, setScale] = useState(1)
  const [portrait, setPortrait] = useState(false)
  const [portraitOk, setPortraitOk] = useState(false)
  const [view, setView] = useState<View>(() => viewOf(game))
  const viewRef = useRef(view)
  const [tok, setTok] = useState<Tokens>({ shown: false, verdict: 'VS' })
  const [hits, setHits] = useState('')
  const [locked, setLocked] = useState<Action | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(readSpeed)
  const skip = useRef(false)
  const [sheet, setSheet] = useState<{ side: Side; card: CardInst } | { tip: Tip } | 'log' | 'settings' | null>(null)
  const [glow, setGlow] = useState<Record<string, string>>({})
  const [down, setDown] = useState<Side | null>(null)

  // keep the view in step with the game whenever no playback is running
  useEffect(() => {
    if (!turn) {
      const v = viewOf(game)
      viewRef.current = v
      setView(v)
      setDown(game.winner && game.winner !== 'draw' ? other(game.winner) : null)
    }
  }, [game, turn])

  useLayoutEffect(() => {
    const fit = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setPortrait(h > w * 1.1 && w < 700)
      setScale(Math.min(w / W, h / H))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const k = () => (skip.current ? 12 : speed)
  const commit = (fn: (v: View) => View) => {
    const v = fn(viewRef.current)
    viewRef.current = v
    flushSync(() => setView(v))
  }

  // ---------- animation helpers ----------
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms / k()))
  const anim = (el: Element | null | undefined, kf: Keyframe[], ms: number, opt: { easing?: string; fill?: FillMode; delay?: number } = {}) => {
    if (!el) return Promise.resolve()
    if (reduceMotion()) kf = [{ opacity: 0.5 }, { opacity: 1 }]
    return (el as HTMLElement)
      .animate(kf, { duration: Math.max(1, ms / k()), easing: opt.easing ?? 'cubic-bezier(.2,.8,.2,1)', fill: opt.fill ?? 'none', delay: (opt.delay ?? 0) / k() })
      .finished.catch(() => undefined)
  }
  const pos = (el: Element | null | undefined) => {
    const stage = stageRef.current!
    if (!el) return { x: W / 2, y: H / 2 }
    const r = el.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    const sc = s.width / W
    return { x: (r.left + r.width / 2 - s.left) / sc, y: (r.top + r.height / 2 - s.top) / sc }
  }
  const q = (sel: string) => stageRef.current?.querySelector(sel) as HTMLElement | null
  const cardEl = (uid: string) => q(`.card[data-uid="${CSS.escape(uid)}"]`)
  const fighter = (side: Side) => q(`.fighter.${side}`)
  const pile = (side: Side) => q(`.hud.${side} .pile`)
  const add = (html: string) => {
    const t = document.createElement('template')
    t.innerHTML = html.trim()
    const el = t.content.firstChild as HTMLElement
    fxRef.current!.appendChild(el)
    return el
  }
  const pop = (x: number, y: number, text: string, cls = '', size = 1) => {
    const el = add(`<div class="pop ${cls}" style="left:${x}px;top:${Math.max(y, 60)}px${size !== 1 ? `;font-size:${Math.round(38 * size)}px` : ''}">${text}</div>`)
    anim(el, [
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%,-80%) scale(1)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%,-110%) scale(.9)', opacity: 0 },
    ], 900).then(() => el.remove())
  }
  const spark = (x: number, y: number, color: string) => {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      return `<line x1="${35 + Math.cos(a) * 12}" y1="${35 + Math.sin(a) * 12}" x2="${35 + Math.cos(a) * 32}" y2="${35 + Math.sin(a) * 32}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`
    }).join('')
    const el = add(`<svg class="spark" viewBox="0 0 70 70" style="left:${x}px;top:${y}px">${rays}</svg>`)
    anim(el, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(20deg)', opacity: 0 }], 360).then(() => el.remove())
  }
  const toast = (side: Side, small: string, big: string) => {
    const p = pos(q(`.hud.${side} .portrait`))
    const el = add(`<div class="toast" style="left:${p.x + 30}px;top:${p.y - 18}px"><small>${small}</small>${big}</div>`)
    return anim(el, [
      { transform: 'scale(.4)', opacity: 0 },
      { transform: 'scale(1.1)', opacity: 1, offset: 0.15 },
      { transform: 'scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translateY(-10px)', opacity: 0 },
    ], 1500).then(() => el.remove())
  }
  const shake = (el: Element | null, px = 6) =>
    anim(el, [{ transform: 'translate(0,0)' }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: `translate(${px}px,${-px / 2}px)` }, { transform: `translate(${-px / 2}px,0)` }, { transform: 'translate(0,0)' }], 260)

  // ---------- camera and impact (the stage's own transform fits it to the window, so these use `translate` / `scale`) ----------
  const camShake = (px: number) => {
    if (reduceMotion()) return
    const st = stageRef.current
    st?.animate([{ translate: '0 0' }, { translate: `${-px}px ${px * 0.6}px` }, { translate: `${px * 0.8}px ${-px * 0.5}px` }, { translate: `${-px * 0.4}px ${px * 0.3}px` }, { translate: '0 0' }], { duration: 280 / k(), easing: 'ease-out' })
  }
  // zoom toward a stage point for a moment (signature combos, K.O.)
  const camZoom = (x: number, y: number, z: number, ms: number) => {
    const st = stageRef.current
    if (!st || reduceMotion()) return Promise.resolve()
    const fit = st.getBoundingClientRect().width / W
    const tx = x * fit * (1 - z)
    const ty = y * fit * (1 - z)
    return st
      .animate([{ scale: '1', translate: '0 0' }, { scale: `${z}`, translate: `${tx}px ${ty}px`, offset: 0.25 }, { scale: `${z}`, translate: `${tx}px ${ty}px`, offset: 0.75 }, { scale: '1', translate: '0 0' }], { duration: ms / k(), easing: 'cubic-bezier(.3,0,.2,1)' })
      .finished.catch(() => undefined)
  }
  // freeze everything in the hit for a beat so the blow lands
  const hitStop = async (els: (Element | null | undefined)[], ms: number) => {
    const running = els.flatMap((e) => (e ? (e as HTMLElement).getAnimations({ subtree: true }) : []))
    running.forEach((a) => a.pause())
    await wait(ms)
    running.forEach((a) => a.play())
  }
  const flash = (color = '#fff', peak = 0.5) => {
    const el = add(`<div class="flash" style="background:${color}"></div>`)
    anim(el, [{ opacity: peak }, { opacity: 0 }], 220, { easing: 'ease-out' }).then(() => el.remove())
  }

  // ---------- Champion poses (AI stands left facing right, you stand right facing left) ----------
  const facing = (side: Side) => (side === 'p2' ? 1 : -1)
  // Sprite Champions swap to a pose frame (.pose-P etc, see arena.css) for a moment; SVG dolls ignore it
  const showPose = (f: Element, pose: Pose, ms: number) => {
    if (!f.querySelector('.sprite')) return
    f.className = f.className.replace(/ ?pose-\S+/g, '') + ` pose-${pose}`
    clearTimeout(poseTimers.current.get(f))
    poseTimers.current.set(f, window.setTimeout(() => f.classList.remove(`pose-${pose}`), ms / k()))
  }
  // Strike chains are fought up close: run across with afterimages, then hop back home after the chain
  const ghosts = (f: HTMLElement, side: Side, n: number, gap: number) => {
    const p = pos(f)
    const body = f.querySelector('svg, .sprite') as HTMLElement | null
    if (!body) return
    const frame = getComputedStyle(body).backgroundPosition
    for (let i = 0; i < n; i++) {
      const g = add(`<div class="ghostimg" style="left:${p.x}px;top:${p.y}px">${body.outerHTML}</div>`)
      const inner = g.firstChild as HTMLElement
      inner.style.backgroundPosition = frame
      if (side === 'p1') inner.style.transform = 'scaleX(-1)'
      anim(g, [{ opacity: 0.4 }, { opacity: 0 }], 260, { delay: (i + 1) * gap }).then(() => g.remove())
    }
  }
  const dust = (f: HTMLElement, side: Side) => {
    const p = pos(f)
    const el = add(`<div class="dust" style="left:${p.x - 18 * facing(side)}px;top:${p.y + 36}px"></div>`)
    anim(el, [{ opacity: 0.8, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 0, transform: `translate(calc(-50% + ${-24 * facing(side)}px),-60%) scale(1.4)` }], 420, { easing: 'ease-out' }).then(() => el.remove())
  }
  const travel = async (side: Side, dx: number, ms: number, hop: number) => {
    const f = fighter(side)
    if (!f) return
    const from = f.style.translate || '0px 0px'
    const to = `${dx}px 0px`
    if (reduceMotion()) {
      f.style.translate = dx ? to : ''
      return
    }
    f.style.zIndex = dx ? '5' : ''
    await f
      .animate([{ translate: from }, { translate: `${dx / 2 + parseFloat(from) / 2}px ${-hop}px`, offset: 0.5 }, { translate: to }], { duration: ms / k(), easing: 'cubic-bezier(.4,0,.2,1)' })
      .finished.catch(() => undefined)
    f.style.translate = dx ? to : ''
  }
  // how far each striking side runs: up to the foe, or to meet in the middle when both Strike
  const closeIn = (strikers: Side[]) =>
    Promise.all(
      strikers.map((side) => {
        const f = fighter(side)
        const foe = fighter(other(side))
        if (!f || !foe) return undefined
        const gap = pos(foe).x - pos(f).x
        const dx = strikers.length > 1 ? gap / 2 - Math.sign(gap) * 48 : gap - Math.sign(gap) * 96
        showPose(f, 'dash', 300)
        dust(f, side)
        ghosts(f, side, 3, 60)
        return travel(side, dx, 300, 6)
      }),
    )
  const charAttack = (side: Side, type: string, pose: Pose) => {
    const f = fighter(side)
    if (!f) return
    const d = facing(side)
    showPose(f, pose, 520)
    const limb = f.querySelector(type === 'K' ? '.leg-f' : '.arm-f')
    const ang = type === 'K' ? -80 : type === 'P' ? -95 : -145
    anim(f, [{ transform: 'none' }, { transform: `translateX(${-8 * d}px) rotate(${-6 * d}deg)`, offset: 0.3 }, { transform: `translateX(${38 * d}px) rotate(${4 * d}deg)`, offset: 0.62 }, { transform: 'none' }], 520, { easing: 'cubic-bezier(.5,0,.3,1)' })
    anim(limb, [{ transform: 'rotate(0)' }, { transform: 'rotate(30deg)', offset: 0.3 }, { transform: `rotate(${ang}deg)`, offset: 0.62 }, { transform: 'rotate(0)' }], 520)
    if (type === 'K') anim(f.querySelector('.bob'), [{ transform: 'none' }, { transform: 'rotate(-14deg)', offset: 0.62 }, { transform: 'none' }], 520)
    if (type === 'S') {
      const aura = f.querySelector('.aura') as HTMLElement
      aura.style.background = 'radial-gradient(circle at 50% 50%, rgba(169,107,255,.8), transparent 65%)'
      anim(aura, [{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], 600).then(() => (aura.style.background = ''))
    }
  }
  const charHit = (side: Side, dmg = 10) => {
    const d = facing(side)
    const hitF = fighter(side)
    if (hitF) showPose(hitF, 'hit', 420)
    const knock = Math.min(34, 10 + dmg * 0.8)
    return anim(fighter(side), [
      { transform: 'none', filter: 'brightness(3) saturate(0)' },
      { transform: `translateX(${-knock * d}px) rotate(${-10 * d}deg)`, filter: 'brightness(1.6) sepia(1) saturate(6) hue-rotate(-40deg)', offset: 0.25 },
      { transform: `translateX(${-knock * 0.4 * d}px)`, filter: 'none', offset: 0.6 },
      { transform: 'none', filter: 'none' },
    ], 420, { easing: 'cubic-bezier(.2,.9,.3,1)' })
  }
  const charBlocked = (side: Side) => anim(fighter(side), [{ transform: 'none' }, { transform: `translateX(${-6 * facing(side)}px)`, offset: 0.3 }, { transform: 'none' }], 240)
  const guard = (side: Side, on: boolean) => fighter(side)?.classList.toggle('guarding', on)
  const charCharge = (side: Side) => {
    const f = fighter(side)
    if (!f) return
    anim(f.querySelector('.aura'), [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.1)', offset: 0.5 }, { opacity: 0, transform: 'scale(1.3)' }], 700)
    showPose(f, 'charge', 700)
    anim(f.querySelector('.bob'), [{ transform: 'none' }, { transform: 'translateY(5px) scaleY(.86)', offset: 0.4 }, { transform: 'translateY(-4px) scaleY(1.06)', offset: 0.75 }, { transform: 'none' }], 700)
  }
  const charCombo = async (side: Side) => {
    const f = fighter(side)
    if (!f) return
    const d = facing(side)
    const p = pos(f)
    showPose(f, 'signature', 800)
    for (let i = 0; i < 3; i++) {
      const g = add(`<div class="ghostimg" style="left:${p.x}px;top:${p.y}px">${f.querySelector('svg, .sprite')!.outerHTML}</div>`)
      if (side === 'p1') (g.firstChild as HTMLElement).style.transform = 'scaleX(-1)'
      anim(g, [{ opacity: 0.5, transform: 'translate(-50%,-50%)' }, { opacity: 0, transform: `translate(calc(-50% + ${-30 * d * (i + 1)}px),-50%)` }], 600, { delay: i * 90 }).then(() => g.remove())
    }
    const aura = f.querySelector('.aura') as HTMLElement
    aura.style.background = 'radial-gradient(circle, rgba(255,138,61,.8), rgba(31,198,166,.5) 45%, rgba(169,107,255,.4) 60%, transparent 70%)'
    anim(aura, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.4)', offset: 0.5 }, { opacity: 0, transform: 'scale(1.8)' }], 900).then(() => (aura.style.background = ''))
    await anim(f, [{ transform: 'none' }, { transform: `translateY(-30px) rotate(${360 * d}deg) scale(1.2)`, offset: 0.55 }, { transform: 'translateY(0) scale(1.25)', offset: 0.75 }, { transform: 'none' }], 800)
  }

  // ---------- one turn ----------
  async function playback(tn: Turn) {
    const { prev, next, actions } = tn
    setPlaying(true)
    skip.current = false
    setHits('')
    // lock in, then both tokens flip together
    setTok({ shown: false, verdict: 'VS' })
    await wait(320)
    const tokens = [q('.tok.p1'), q('.tok.p2')]
    await Promise.all(tokens.map((el) => anim(el, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], 150, { easing: 'ease-in' })))
    const win: Side | undefined = actions.p1 === actions.p2 ? undefined : BEATS[actions.p1] === actions.p2 ? 'p1' : 'p2'
    const verdict = win ? t('{a} beats {b}', { a: label(actions[win]), b: label(actions[other(win)]) }) : t('{a} meets {b}', { a: label(actions.p1), b: label(actions.p2) })
    flushSync(() => setTok({ p1: actions.p1, p2: actions.p2, shown: true, verdict, lose: win ? other(win) : undefined }))
    await Promise.all(tokens.map((el) => anim(el, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], 150, { easing: 'ease-out' })))
    if (win) {
      shake(q(`.tok.${other(win)}`), 5)
      await anim(q(`.tok.${win}`), [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', filter: 'brightness(1.3)' }, { transform: 'scale(1)' }], 380)
    }
    for (const side of SIDES) {
      if (actions[side] === 'charge') charCharge(side)
      if (actions[side] === 'block') guard(side, true)
    }
    await wait(250)

    let tail: Promise<unknown> = Promise.resolve()
    const count: Record<Side, number> = { p1: 0, p2: 0 }
    const events = next.events ?? []
    // Strike chains: each card picks its own frame (strikePoses.ts), with a run up to the foe (closeIn) before the first and a hop home after
    const chainLen: Record<Side, number> = { p1: 0, p2: 0 }
    for (const ev of events) if (ev.k === 'hit') chainLen[ev.side]++
    const chain: Record<Side, ChainCount> = { p1: newChain(), p2: newChain() }
    const struck: Record<Side, number> = { p1: 0, p2: 0 }
    const strikers = SIDES.filter((side) => chainLen[side] > 0)
    let closed = false
    let home: Promise<unknown> = Promise.resolve()
    // hop back as soon as the last chain card lands, while the Field sweeps
    const goHome = async () => {
      const backs = SIDES.filter((side) => fighter(side)?.style.translate)
      for (const side of backs) {
        const f = fighter(side)
        if (f) showPose(f, 'backstep', 420)
      }
      await Promise.all(backs.map((side) => travel(side, 0, 380, 22)))
      for (const el of [q('.tok.p1'), q('.tok.p2')]) if (el) el.style.opacity = ''
    }
    for (const [i, ev] of events.entries()) {
      if (ev.k === 'hit' && !closed) {
        closed = true
        // the fighters fight over the tokens: fade them out of the way
        for (const el of [q('.tok.p1'), q('.tok.p2')]) if (el) anim(el, [{ opacity: 1 }, { opacity: 0.2 }], 200).then(() => (el.style.opacity = '0.2'))
        await closeIn(strikers)
      }
      if (ev.k !== 'hp') await tail
      tail = Promise.resolve()
      if (ev.k === 'hit') {
        const n = struck[ev.side]++
        tail = (await hit(ev, count, strikePose(chain[ev.side], ev.type, n, chainLen[ev.side], ev.crit))).done
        if (strikers.every((side) => struck[side] === chainLen[side])) {
          const last = tail
          home = last.then(goHome)
        }
      }
      else if (ev.k === 'hp') hpChange(ev)
      else if (ev.k === 'sweep') await sweep(ev.side, ev.uids)
      else if (ev.k === 'discard') {
        // a charge break replacement takes the lost card's slot: leave the gap for it instead of sliding
        const nx = events[i + 1]
        await discard(ev.side, ev.uid, ev.reason, nx?.k === 'draw' && nx.side === ev.side && nx.slot != null)
      } else if (ev.k === 'draw') await draw(ev.side, ev.card, ev.slot)
      else if (ev.k === 'combo') await combo(ev.side, ev.name, next)
    }
    await tail
    await home
    await goHome()
    for (const side of SIDES) guard(side, false)

    // Styles that showed up in this turn's log
    const lines = next.log.slice(prev.log.length)
    for (const side of SIDES) {
      const key = next.players[side].style
      const name = key ? STYLES[key]?.name : undefined
      if (name && lines.some((l) => l.includes(`${side} ${name}`) || (l.includes(name) && l.includes(side)))) {
        anim(q(`.hud.${side} .portrait .ring`), [{ opacity: 1, transform: 'scale(.9)' }, { opacity: 0, transform: 'scale(1.9)' }], 600)
        await toast(side, t('Style'), name)
      }
    }
    if (next.winner) {
      if (next.winner !== 'draw') {
        const loser = other(next.winner)
        const p = pos(fighter(loser))
        flash('#fff', 0.7)
        camShake(10)
        camZoom(p.x, p.y, 1.35, 1300)
        await charHit(loser, 40)
        setDown(loser)
      }
      await wait(600)
    }
    await wait(150)
    setLocked(null)
    setHits('')
    setPlaying(false)
    skip.current = false
    props.onDone()
  }

  async function hit(ev: Extract<TurnEvent, { k: 'hit' }>, count: Record<Side, number>, pose: Pose): Promise<{ done: Promise<unknown> }> {
    const foe = other(ev.side)
    const el = cardEl(ev.uid)
    const target = fighter(foe)
    const a = pos(el)
    const b = pos(target)
    const dx = (b.x - a.x) * 0.55
    const dy = (b.y - a.y) * 0.55
    const slot = el?.parentElement
    if (slot) slot.style.zIndex = '10'
    const me = fighter(ev.side)
    charAttack(ev.side, ev.type, pose)
    const dash = anim(el, [
      { transform: 'none' },
      { transform: `translateY(${ev.side === 'p1' ? -16 : 16}px) scale(1.08) rotate(-4deg)`, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(.92)`, offset: 0.62 },
      { transform: 'none' },
    ], 520, { easing: 'cubic-bezier(.5,0,.3,1)' })
    await wait(320)
    if (ev.blocked && !ev.dealt) {
      spark(b.x, b.y, '#4f9dff')
      pop(b.x, b.y - 10, t('BLOCK'), 'soft')
      charBlocked(foe)
    } else if (ev.parried) {
      spark(b.x, b.y, '#4f9dff')
      pop(b.x, b.y - 10, t('PARRY'), 'soft')
      charBlocked(foe)
    } else {
      count[ev.side]++
      spark(b.x, b.y, ev.crit ? '#ffc84a' : '#fff2b8')
      if (ev.crit) pop(b.x, b.y - 40, t('CRITICAL'), 'crit')
      if (ev.absorbed) pop(b.x - 20, b.y - 34, `${t('SHIELD')} −${ev.absorbed}`, 'soft')
      if (ev.dealt > 0) {
        if (ev.crit || ev.dealt >= 20) flash(ev.crit ? '#ffe7a3' : '#fff', ev.crit ? 0.55 : 0.3)
        await hitStop([me, target, el], ev.crit ? 130 : Math.min(110, 40 + ev.dealt * 2))
        charHit(foe, ev.dealt)
        camShake(Math.min(9, 2 + ev.dealt / 4) * (ev.crit ? 1.4 : 1))
      }
      shake(q(`.hud.${foe} .portrait`))
      setHits(t(count[ev.side] > 1 ? '{n} HITS' : '{n} HIT', { n: count[ev.side] }))
    }
    commit((v) => ({ ...v, [ev.side]: { ...v[ev.side], field: v[ev.side].field.map((c) => (c.card.uid === ev.uid ? { ...c, spent: true } : c)) } }))
    const done = dash.then(() => {
      if (slot) slot.style.zIndex = ''
      return wait(60)
    })
    return { done }
  }

  function hpChange(ev: Extract<TurnEvent, { k: 'hp' }>) {
    const p = pos(fighter(ev.side))
    pop(p.x + (ev.delta < 0 ? 16 : 0), p.y - 6, ev.delta < 0 ? `${ev.delta}`.replace('-', '−') : `+${ev.delta}`, ev.delta < 0 ? 'dmg' : 'heal', 1 + Math.min(0.7, Math.abs(ev.delta) / 40))
    commit((v) => ({ ...v, [ev.side]: { ...v[ev.side], hp: v[ev.side].hp + ev.delta } }))
  }

  async function slideRest(side: Side, mutate: (v: View) => View) {
    const before = new Map(viewRef.current[side].field.map((c) => [c.card.uid, pos(cardEl(c.card.uid))]))
    commit(mutate)
    await Promise.all(
      viewRef.current[side].field.map((c) => {
        const from = before.get(c.card.uid)
        const el = cardEl(c.card.uid)
        if (!from || !el) return undefined
        const to = pos(el)
        return anim(el, [{ transform: `translate(${from.x - to.x}px,${from.y - to.y}px)` }, { transform: 'none' }], 260)
      }),
    )
  }

  async function sweep(side: Side, uids: string[]) {
    const to = pos(pile(side))
    await Promise.all(
      uids.map((uid, i) => {
        const el = cardEl(uid)
        if (!el) return undefined
        const a = pos(el)
        return anim(el, [{ transform: 'none', opacity: 1 }, { transform: `translate(${to.x - a.x}px,${to.y - a.y}px) scale(.35) rotate(-20deg)`, opacity: 0 }], 400, { delay: i * 50, fill: 'forwards', easing: 'ease-in' })
      }),
    )
    commit((v) => ({ ...v, [side]: { ...v[side], field: v[side].field.filter((c) => !uids.includes(c.card.uid)) } }))
  }

  async function discard(side: Side, uid: string, reason: string, keepGap = false) {
    if (!viewRef.current[side].field.some((c) => c.card.uid === uid)) return
    const f = fighter(side)
    if (f && reason === 'Charge break') showPose(f, 'stunned', 700)
    commit((v) => ({ ...v, [side]: { ...v[side], field: v[side].field.map((c) => (c.card.uid === uid ? { ...c, gone: reason } : c)) } }))
    const el = cardEl(uid)
    anim(el, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8) saturate(2)' }, { filter: 'brightness(1)' }], 300)
    await shake(el, 5)
    await wait(380)
    const to = pos(pile(side))
    const a = pos(el)
    await anim(el, [{ transform: 'none', opacity: 1 }, { transform: `translate(${to.x - a.x}px,${to.y - a.y}px) scale(.35) rotate(15deg)`, opacity: 0 }], 380, { fill: 'forwards', easing: 'ease-in' })
    if (keepGap) return // draw() swaps the new card into this slot
    await slideRest(side, (v) => ({ ...v, [side]: { ...v[side], field: v[side].field.filter((c) => c.card.uid !== uid) } }))
  }

  async function draw(side: Side, card: CardInst, slot?: number) {
    if (viewRef.current[side].field.some((c) => c.card.uid === card.uid)) return
    commit((v) => {
      const field = [...v[side].field]
      if (slot == null) field.push({ card })
      else {
        // replace the discarded card still sitting in that slot, or insert there
        const at = field.findIndex((c) => c.gone)
        if (at >= 0) field.splice(at, 1, { card })
        else field.splice(slot, 0, { card })
      }
      return { ...v, [side]: { ...v[side], field } }
    })
    const el = cardEl(card.uid)
    if (!el) return
    const from = pos(pile(side))
    const a = pos(el)
    el.classList.add('back')
    await anim(el, [{ transform: `translate(${from.x - a.x}px,${from.y - a.y}px) scale(.4) rotate(-12deg)` }, { transform: 'none' }], 380)
    await anim(el, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], 120, { easing: 'ease-in' })
    el.classList.remove('back')
    await anim(el, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], 120, { easing: 'ease-out' })
  }

  async function combo(side: Side, name: string, next: GameState) {
    const champ = next.players[side].championId
    const [title, sub] = COMBO_TEXT[`${champ}:${name}`]?.map((s) => t(s)) ?? [t('COMBO'), name]
    const types = name.split(/[^PKS]+/).filter(Boolean)
    // light up 3 chain cards of the combo's types
    const left = [...types]
    const lit: Record<string, string> = {}
    for (const c of viewRef.current[side].field) {
      const i = left.indexOf(c.card.def.type)
      if (i >= 0) {
        lit[c.card.uid] = c.card.def.type
        left.splice(i, 1)
      }
    }
    flushSync(() => setGlow(lit))
    charCombo(side)
    const fp = pos(fighter(side))
    camZoom(fp.x, fp.y, 1.18, 1100)
    anim(q('.fxl .dim'), [{ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { opacity: 0 }], BANNER_MS)
    const b = add(`<div class="banner"><span>${t('Signature combo')} · ${name}</span><b>${title}</b><span>${sub}</span><small>${t('Tap to skip')}</small></div>`)
    // long enough to read (playtest feedback); a tap ends it without skipping the rest of the turn
    b.style.pointerEvents = 'auto'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      b.getAnimations().forEach((a) => a.finish())
    })
    await anim(b, [
      { transform: 'skewY(-4deg) translateX(-110%)' },
      { transform: 'skewY(-4deg) translateX(0)', offset: 0.1 },
      { transform: 'skewY(-4deg) translateX(2%)', offset: 0.9 },
      { transform: 'skewY(-4deg) translateX(110%)' },
    ], BANNER_MS)
    b.remove()
    setGlow({})
  }

  useEffect(() => {
    if (turn) playback(turn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn])

  // ---------- input ----------
  function choose(a: Action) {
    if (playing || turn || game.winner) return
    setLocked(a)
    props.onAction(a)
  }
  function cycleSpeed() {
    const v = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(v)
    try {
      localStorage.setItem('ccc-speed', String(v))
    } catch {
      /* private window: speed just isn't remembered */
    }
  }
  async function fullscreen() {
    try {
      await document.documentElement.requestFullscreen()
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
      setPortraitOk(true)
    } catch {
      /* not allowed here; the board still scales */
    }
  }

  const legal = legalActions(game, 'p1')
  const lastLines = game.log.filter((l) => l.startsWith(`T${game.turn - 1} `)).slice(-3)
  const readable = (l: string) => l.replace(/^T\d+ /, '').replace(/\bp1\b/g, t('You')).replace(/\bp2\b/g, foe)
  // HP at 30% or less: a sprite Champion stands in its hurt stance (arena.css .low)
  const lowHp = (side: Side) => !down && view[side].hp > 0 && view[side].hp <= game.players[side].maxHp * 0.3

  return (
    <div className="arena" style={{ '--k': skip.current ? 12 : speed } as React.CSSProperties}>
      <div className="stage-box" style={{ width: W * scale, height: H * scale }}>
        <div
          className="stage"
          ref={stageRef}
          style={{ transform: `scale(${scale})` }}
          onClick={() => {
            if (playing) skip.current = true
          }}
        >
          {(['p2', 'p1'] as Side[]).map((side) => (
            <Hud
              key={side}
              game={game}
              side={side}
              hp={view[side].hp}
              name={names[side]}
              style={styleNames[side]}
              styleText={props.styleTexts?.[side]}
              foe={foe}
              onTip={(tip) => setSheet({ tip })}
            />
          ))}
          {(['p2', 'p1'] as Side[]).map((side) => (
            <section key={side} className={`field ${side === 'p1' ? 'me' : 'enemy'}`} aria-label={side === 'p1' ? t('Your Field') : t('{who} Field', { who: foe })}>
              {Array.from({ length: game.rules.handMax }, (_, i) => {
                const vc = view[side].field[i]
                // a slot the loadout closed (Deep Roots, Bloodlust)
                const closed = i >= (game.players[side].fieldMax ?? game.rules.handMax)
                return (
                  <div className={`slot${closed ? ' closed' : ''}`} key={i} title={closed ? t('Closed by a Sigil') : undefined}>
                    {closed ? '✕' : i + 1}
                    {vc && (
                      <CardView
                        key={vc.card.uid}
                        vc={vc}
                        game={game}
                        side={side}
                        glow={glow[vc.card.uid]}
                        unpaid={!!turn?.next.players[side].unpaid?.includes(vc.card.uid)}
                        onOpen={() => !playing && setSheet({ side, card: vc.card })}
                      />
                    )}
                  </div>
                )
              })}
            </section>
          ))}
          <div className="lane">
            <div className="lane-left">
              <ComboTracker game={game} side="p2" cards={view.p2.field.filter((v) => !v.gone).map((v) => v.card)} />
              <div className="log">{playing ? '' : lastLines.map(readable).join(' · ') || t('Pick an action. Both sides lock in, then reveal together.')}</div>
              <ComboTracker game={game} side="p1" cards={view.p1.field.filter((v) => !v.gone).map((v) => v.card)} />
            </div>
            <div className="vs">
              <div className={`fighter p2${down === 'p2' ? ' down' : ''}${lowHp('p2') ? ' low' : ''}${down && down !== 'p2' ? ' pose-win' : ''}${conqMax(game, 'p2') ? ' conq-max' : ''}`} dangerouslySetInnerHTML={{ __html: fighterHTML(game.players.p2.championId, game.players.p2.style) }} />
              <TokenView side="p2" tok={tok} playing={playing} foe={foe} />
              <div className="verdict">{hits || tok.verdict}</div>
              <TokenView side="p1" tok={tok} playing={playing} locked={locked} foe={foe} />
              <div className={`fighter me p1${down === 'p1' ? ' down' : ''}${lowHp('p1') ? ' low' : ''}${down && down !== 'p1' ? ' pose-win' : ''}${conqMax(game, 'p1') ? ' conq-max' : ''}`} dangerouslySetInnerHTML={{ __html: fighterHTML(game.players.p1.championId, game.players.p1.style) }} />
            </div>
          </div>
          <div className="side">
            <div>
              <div className="turn">
                {t('TURN')}<b>{game.turn}</b>
              </div>
              <div className="tools">
                <button
                  type="button"
                  className="tool"
                  aria-label={t('Settings')}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!playing) setSheet('settings')
                  }}
                >
                  ⚙
                </button>
              </div>
            </div>
            <div className="acts">
              {ACTIONS.map(({ action, label: name, beats }) => (
                <button
                  key={action}
                  type="button"
                  className={`act ${action}${locked === action ? ' locked' : ''}`}
                  disabled={playing || !!turn || !!game.winner || !!props.busy || !legal.includes(action)}
                  onClick={(e) => {
                    e.stopPropagation()
                    choose(action)
                  }}
                >
                  {t(name)}
                  <small>{t(beats)}</small>
                </button>
              ))}
            </div>
          </div>
          {props.banner && !playing && (
            <div key={`${game.turn}:${props.banner}`} className={`banner${props.bannerFades ? ' fades' : ''}`}>
              {props.banner}
            </div>
          )}
          <div className="fxl" ref={fxRef}>
            <div className="dim" />
          </div>
          {game.winner && !playing && !turn && (
            <div className="result">
              <h2 className={game.winner === 'p2' ? 'lost' : ''}>{game.winner === 'draw' ? t('DRAW') : game.winner === 'p1' ? t('YOU WIN!') : 'K.O.'}</h2>
              <div className="row">
                {props.onRestart && (
                  <button type="button" className="big-btn" onClick={props.onRestart}>
                    {t('Play again')}
                  </button>
                )}
                <button type="button" className="big-btn alt" onClick={props.onQuit}>
                  {t('Change Champion')}
                </button>
              </div>
            </div>
          )}
          {sheet && (
            <div className="sheet" onClick={() => setSheet(null)}>
              {sheet === 'settings' ? (
                <div className="info settings">
                  <b>{t('Settings')}</b>
                  <LangToggle />
                  <button type="button" className="big-btn" onClick={(e) => (e.stopPropagation(), cycleSpeed())}>
                    {t('Animation speed {n}x', { n: speed })}
                  </button>
                  <button type="button" className="big-btn" onClick={(e) => (e.stopPropagation(), setSheet('log'))}>
                    {t('Match log')}
                  </button>
                  {props.settingsExtra && <div onClick={(e) => e.stopPropagation()}>{props.settingsExtra}</div>}
                  <button type="button" className="big-btn alt" onClick={props.onQuit}>
                    {t('Quit to Champion select')}
                  </button>
                  <p>{t('Tap outside to close.')}</p>
                </div>
              ) : typeof sheet === 'object' && 'tip' in sheet ? (
                <div className="info">
                  <b>{sheet.tip.title}</b>
                  {sheet.tip.body.split('\n').map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                  <p>{t('Tap anywhere to close.')}</p>
                </div>
              ) : sheet === 'log' ? (
                <div className="info" style={{ maxWidth: 560, width: '100%' }}>
                  <b>{t('Match log')}</b>
                  <ul>
                    {game.log.map((l, i) => (
                      <li key={i}>{l.replace(/\bp1\b/g, t('You')).replace(/\bp2\b/g, foe)}</li>
                    ))}
                  </ul>
                  <p>{t('Tap anywhere to close.')}</p>
                </div>
              ) : (
                <CardSheet game={game} side={sheet.side} card={sheet.card} />
              )}
            </div>
          )}
        </div>
      </div>
      {portrait && !portraitOk && (
        <div className="rotate">
          <div className="phone" />
          <b>{t('Turn your phone sideways')}</b>
          <p>{t('The battle screen is made for landscape.')}</p>
          <button type="button" className="big-btn" onClick={fullscreen}>
            {t('Fullscreen landscape')}
          </button>
          <button type="button" className="link" onClick={() => setPortraitOk(true)}>
            {t('Play in portrait anyway')}
          </button>
        </div>
      )}
    </div>
  )
}

function TokenView({ side, tok, playing, locked, foe }: { side: Side; tok: Tokens; playing: boolean; locked?: Action | null; foe: string }) {
  const a = tok.shown ? tok[side] : undefined
  const cls = `tok ${side}${a ? ` ${a}` : ''}${tok.shown && tok.lose === side ? ' lose' : ''}`
  return (
    <div className={cls}>
      {a ? (
        <span>
          <small>{side === 'p1' ? t('You') : foe}</small>
          {label(a)}
        </span>
      ) : playing || locked ? (
        '…'
      ) : (
        '?'
      )}
    </div>
  )
}

type Tip = { title: string; body: string }
/** Tank Lifeline Endurance numbers (Ascendancy keys live in the Style's group, untyped) */
const enduranceNum = (game: GameState, side: Side) => tuningOf(game, side)['TK:1'] as unknown as Record<string, number>
type Chip = { label: string; tone: 'buff' | 'debuff'; tip: string }

const turnsLeft = (s: Status) => (s.turns > 0 && s.turns < 50 ? `\n${t(s.turns === 1 ? '{n} turn left.' : '{n} turns left.', { n: s.turns })}` : '')
/** "stack" / "stacks", "hit" / "hits": English picks the form, Thai has one */
const pl = (n: number, one: string, many: string, vars: Record<string, string | number> = {}) => t(n === 1 ? one : many, { n, ...vars })
/** Status chip: label, buff (good for whoever carries it) or debuff, and the tap-to-read text. */
function statusChip(s: Status, frozen: boolean): Chip {
  const n = s.n ?? 1
  const [label, tone, tip]: [string, Chip['tone'], string] =
    s.kind === 'blockPlus' ? (n >= 0 ? [`Block +${n}`, 'buff', pl(n, 'Your Block stops {n} more hit.', 'Your Block stops {n} more hits.')] : [`Block −${-n}`, 'debuff', pl(-n, 'Your Block stops {n} fewer hit.', 'Your Block stops {n} fewer hits.')])
    : s.kind === 'trueDmg' ? ['True Dmg', 'buff', t('Your hits ignore damage cuts. Only Block stops them.')]
    : s.kind === 'guardBreak' ? ['Guard Crush', 'buff', t('Your next Strike: blocked hits still deal part of their damage, and a Blocking opponent loses their 2 oldest Field cards.')]
    : s.kind === 'shield' ? [`Shield ${s.n ?? 0}`, 'buff', t('Absorbs {n} damage from hits before your HP.', { n: s.n ?? 0 })]
    : s.kind === 'parry' ? [`Parry ${n}`, 'buff', pl(n, 'The next {n} hit that gets past your Block deals 0.', 'The next {n} hits that get past your Block deal 0.')]
    : s.kind === 'subZero' ? ['❄ Sub-Zero', 'buff', t('Your next Strike: every clean hit gives the enemy 1 Chill.')]
    : s.kind === 'frozenTomb' ? ['🧊 Frozen Tomb', 'buff', t("Sealed in ice: you can't Strike or Charge this turn, and you heal.")]
    : s.kind === 'thaw' ? ['💧 Thaw', 'buff', t("Just thawed: you can't be Frozen again yet.")]
    : s.kind === 'noBlock' ? ['No Block', 'debuff', t("You can't Block this turn.")]
    : s.kind === 'noStrike' ? (frozen ? ['🧊 Frozen', 'debuff', t("Frozen: you can't Strike.")] : ['No Strike', 'debuff', t("You can't Strike this turn.")])
    : s.kind === 'noCharge' ? ['No Charge', 'debuff', t("You can't Charge this turn.")]
    : s.kind === 'silence' ? ['Silenced', 'debuff', t("Your cards' effects don't fire this turn. Styles and combos still work.")]
    : s.kind === 'skillSilence' ? ['Skill effects off', 'debuff', t("Your S cards' effects don't fire this turn. They still deal damage.")]
    : s.kind === 'vulnerable' ? [`Vulnerable ${s.n ?? 0}%`, 'debuff', t('You take {n}% more damage from hits.', { n: s.n ?? 0 })]
    : s.kind === 'deathMark' ? ['💀 Mark of Assassin', 'debuff', t('Every Strike against you bursts for extra damage, even through Block.')]
    : s.kind === 'ignite' ? [`🔥 Ignite ${n}`, 'debuff', pl(n, 'Burning ({n} stack): you lose HP every turn and your healing is cut.', 'Burning ({n} stacks): you lose HP every turn and your healing is cut.')]
    : s.kind === 'venom' ? [`🐍 Venom ${n}`, 'debuff', pl(n, 'Poisoned ({n} stack): you lose 1 HP per stack at the end of every turn.', 'Poisoned ({n} stacks): you lose 1 HP per stack at the end of every turn.')]
    : s.kind === 'cutGuard' ? ['✂ Cut guard', 'buff', t("You just lost Field cards to Cut, so your Field can't be Cut again for now.")]
    : s.kind === 'woundUp' ? ['🥊 Wound Up', 'buff', t('Your next Strike is a Payback: after your S cards pay, chain slot 1 spends all Rage left as extra damage.')]
    : s.kind === 'chill' ? [`❄ Chill ${n}`, 'debuff', pl(n, 'Chilled ({n} stack): your damage is cut for each stack.', 'Chilled ({n} stacks): your damage is cut for each stack.')]
    : [s.kind, 'debuff', s.kind]
  return { label, tone, tip: tip + turnsLeft(s) }
}

const RESOURCE_TIP: Record<string, string> = {
  TK: 'Tank pays for S cards with HP.',
  BR: 'Rage fills when you hit or get hit. S cards cost Rage; without enough, the card hits weaker and its effect is off.',
  MG: 'Mana comes from Charge, Block and clean P/K hits. S cards cost Mana; without enough, the effect is off.',
  AS: 'Energy refills by 1 every turn. S cards cost Energy; without enough, the effect is off.',
}

function Hud({ game, side, hp, name, style, styleText, foe, onTip }: { game: GameState; side: Side; hp: number; name: string; style: string; styleText?: string; foe: string; onTip: (t: Tip) => void }) {
  const p = game.players[side]
  const pct = Math.max(0, Math.min(100, (hp / p.maxHp) * 100))
  const res = game.rules.resources ? resourceOf(p.championId, tuningOf(game, side)) : undefined
  // chips and badges sit on the stage, whose click skips playback, so taps stop there
  const tap = (t: Tip) => (e: React.MouseEvent) => (e.stopPropagation(), onTip(t))
  const resTip = res && { title: res.payWithHp ? t('Pays with HP') : `${res.name} ${p.res ?? 0}/${res.cap}`, body: RESOURCE_TIP[p.championId] ? t(RESOURCE_TIP[p.championId]) : res.name }
  const resView = !res ? null : res.payWithHp ? (
    <button type="button" className="res" onClick={tap(resTip!)}>
      S = HP
    </button>
  ) : res.cap <= 5 ? (
    <button type="button" className="res" aria-label={resTip!.title} onClick={tap(resTip!)}>
      {Array.from({ length: res.cap }, (_, i) => (
        <i key={i} className={`pip${i < (p.res ?? 0) ? '' : ' off'}`} />
      ))}
    </button>
  ) : (
    <button type="button" className="res" onClick={tap(resTip!)}>
      {res.name} {p.res ?? 0}/{res.cap}
    </button>
  )
  const frozen = p.statuses.some((x) => x.kind === 'frozen')
  const conqMaxN = tuningOf(game, side)['BR:2'].conquerorMax
  const chips: Chip[] = [
    // frozen is only a marker for cards (the No Strike chip shows the freeze); Frozen Tomb's chip stands for its No Strike / No Charge
    ...p.statuses.filter((s) => s.kind !== 'frozen' && !(['noStrike', 'noCharge'].includes(s.kind) && p.statuses.some((x) => x.kind === 'frozenTomb'))).map((s) => statusChip(s, frozen)),
    ...(p.comboData?.conqueror
      ? [{ label: conqMax(game, side) ? '🔥 Momentum MAX' : `Momentum ${p.comboData.conqueror}/${conqMaxN}`, tone: 'buff' as const, tip: t('Juggernaut stacks: +1 dmg per stack on every chain card. At {max}: Lifesteal and Tenacity for a few turns. Blocking loses a stack.', { max: conqMaxN }) }]
      : []),
    // Tank Lifeline: Endurance stacks (perkData), with their cut / regen
    ...(p.perkData?.endurance
      ? [{ label: `⛨ Endurance ${p.perkData.endurance}/${enduranceNum(game, side).ascEnduranceMax}`, tone: 'buff' as const, tip: t('{n} Endurance: hits that reach you deal {cut} less dmg, and you regain {regen} HP at the end of every turn. Fades after {turns} turns without a new one.', { n: p.perkData.endurance, cut: Math.floor((p.perkData.endurance * enduranceNum(game, side).ascEnduranceCut * enduranceNum(game, side).ascEndurancePower) / 100), regen: Math.floor((p.maxHp * p.perkData.endurance * enduranceNum(game, side).ascEnduranceRegen * enduranceNum(game, side).ascEndurancePower) / 10000), turns: enduranceNum(game, side).ascEnduranceTurns }) }]
      : []),
    ...((p.perkData?.undyingUntil ?? 0) >= game.turn
      ? [{ label: '💀 Undying', tone: 'buff' as const, tip: t("Your HP can't drop below 1 until turn {turn}, and every chain card deals bonus dmg. When it ends you heal the bonus dmg that landed.", { turn: p.perkData!.undyingUntil! }) }]
      : []),
    // Sonic Bliz: what Overdrive adds to every card if this side Strikes now, so both players can see it coming
    ...(overdriveAdd(game, side) ? [{ label: `⚡ Overdrive +${overdriveAdd(game, side)}`, tone: 'buff' as const, tip: t('If this side Strikes now with no S card, every chain card gets +{n} dmg and all Energy is spent.', { n: overdriveAdd(game, side) }) }] : []),
  ]
  const who = (
    <div className="who" key="who">
      <div className="portrait" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${champColor(p.championId)})` }}>
        {p.championId}
        <i className="ring" />
      </div>
      <div className="name">
        <b>{name}</b>
        <span>
          {side === 'p1' ? t('You') : foe} ·{' '}
          {style && styleText ? (
            <button type="button" className="style-link" onClick={tap({ title: style, body: styleText })}>
              {style} ⓘ
            </button>
          ) : (
            style || t('No Style')
          )}
        </span>
      </div>
    </div>
  )
  const bar = (
    <div key="bar">
      <div className="hpbar">
        <i className="ghost" style={{ width: `${pct}%` }} />
        <i className={`fill${pct < 30 ? ' low' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="hptext">
        <span>
          {hp} / {p.maxHp}
        </span>
        {resView}
      </div>
    </div>
  )
  const meta = (
    <div className="meta" key="meta">
      <div className="pile" title={t('Deck')}>
        {p.deck.length}
      </div>
      <div className="chips">
        {chips.map((c, i) => (
          <button type="button" className={`chip ${c.tone}`} key={i} onClick={tap({ title: c.label, body: c.tip })}>
            {c.tone === 'buff' ? '▲' : '▼'} {c.label}
          </button>
        ))}
      </div>
    </div>
  )
  return <aside className={`hud ${side} ${side === 'p1' ? 'me' : 'enemy'}`}>{side === 'p2' ? [who, bar, meta] : [meta, bar, who]}</aside>
}

const TIMING: [string, string][] = [
  ['Before action', 'BEFORE'],
  ['On hit', 'ON HIT'],
  ['After action', 'AFTER'],
  ['Every turn (Hold)', 'HOLD'],
  ['Comes into play', 'ON DRAW'],
]
const SHORT: [RegExp, string][] = [
  [/you play (Strike|Block|Charge)/g, 'you $1'],
  [/opponent plays /g, 'opp. '],
  [/this card hits clean/g, 'clean hit'],
  [/this card is blocked/g, 'blocked'],
  [/ from the Field to the bottom of their deck \(Cut\)/g, ' (Cut)'],
  [/the opponent's card in this slot onto your Field/g, 'the facing card'],
  [/Opponent discards their /g, 'Opp. discards '],
  [/opponent's/g, "opp.'s"],
  [/Opponent/g, 'Opp.'],
  [/opponent/g, 'opp.'],
]
const shorten = (t: string) => SHORT.reduce((s, [re, to]) => s.replace(re, to), t)
/** Card-face version of one rule of effect text: timing tag, short condition, the effect itself. Full text stays in the card sheet. */
function cardRule(rule: string): { timing: string; cond: string; act: string } {
  let rest = rule
  let timing = ''
  for (const [long, tag] of TIMING) {
    if (!rest.startsWith(long)) continue
    timing = tag
    rest = rest.slice(long.length).replace(/^,\s*/, '')
  }
  const cut = rest.indexOf(': ')
  const cond = cut >= 0 ? rest.slice(0, cut) : ''
  const act = cut >= 0 ? rest.slice(cut + 2) : rest.replace(/^:\s*/, '')
  return { timing, cond: shorten(cond).replace(/ and /g, ' + '), act: shorten(act.charAt(0).toUpperCase() + act.slice(1)) }
}

function cardFacts(game: GameState, side: Side, card: CardInst) {
  const p = game.players[side]
  const { id, type, dmg, effectText, effectSpec } = card.def
  const res = game.rules.resources ? resourceOf(p.championId, tuningOf(game, side)) : undefined
  const cost = res ? costOf(p.championId, card, tuningOf(game, side), p.costMod) : 0
  const short = !!res && !res.payWithHp && res.unpaidDmgPct != null && cost > (p.res ?? 0) ? res.unpaidDmgPct : undefined
  const grow = (card.grow ?? 0) + (card.growNext ?? 0)
  const base = short != null ? Math.floor((dmg * short) / 100) : dmg
  const text = effectSpec?.length ? describeSpec(effectSpec) : effectText
  const missing = isEffectMissing(id, effectText, effectSpec)
  const costName = res?.payWithHp ? 'HP' : (res?.name ?? '')
  // why this card's effect won't fire if it's played now (same rules as effectOf in engine/state.ts)
  const off = !text
    ? undefined
    : p.statuses.some((s) => s.kind === 'silence')
      ? t('Silenced')
      : type === 'S' && p.statuses.some((s) => s.kind === 'skillSilence')
        ? t('Skills off')
        : short != null
          ? t('No {res}', { res: costName })
          : undefined
  return { id, type, dmg, total: base + grow, grow, short, cost, costName, text, missing, off }
}

function CardView({ vc, game, side, glow, unpaid, onOpen }: { vc: VCard; game: GameState; side: Side; glow?: string; unpaid?: boolean; onOpen: () => void }) {
  const f = cardFacts(game, side, vc.card)
  // during playback the engine already knows which chain cards went unpaid this turn
  const off = f.off ?? (unpaid && f.text ? t('No {res}', { res: f.costName }) : undefined)
  const cls = `card t-${f.type}${vc.spent ? ' spent' : ''}${vc.gone ? ' gone' : ''}${off ? ' off' : ''}${glow ? ` glow-${glow}` : ''}`
  return (
    <button type="button" className={cls} data-uid={vc.card.uid} aria-label={`${f.id}, ${f.type}, ${t('{n} damage', { n: f.total })}`} onClick={(e) => (e.stopPropagation(), onOpen())}>
      <div className="top">
        <span className="type">{f.type}</span>
        {f.cost > 0 && (
          <span className="cost" title={t('Costs {n} {res}', { n: f.cost, res: f.costName })}>
            {f.cost} {f.costName === 'HP' ? 'HP' : f.costName.slice(0, 1)}
          </span>
        )}
      </div>
      <span className="dmg">{f.total}</span>
      {f.short != null ? <span className="mod down">{f.short}%</span> : f.grow ? <span className={`mod${f.grow < 0 ? ' down' : ''}`}>{f.grow > 0 ? `+${f.grow}` : f.grow}</span> : null}
      {vc.card.owner && <span className="mod down" style={{ bottom: 17 }}>{t('stolen')}</span>}
      <div className="fx">
        {f.missing && <span className="rule">⚠ {t('no code yet')}</span>}
        {vc.card.def.effectSpec?.length ? (
          <CompactFx spec={vc.card.def.effectSpec} res={f.costName || undefined} />
        ) : f.text ? (
          f.text.split(' / ').map((rule, i) => {
            const r = cardRule(rule)
            return (
              <span className="rule" key={i}>
                {r.timing && <span className="tim">{r.timing}</span>}
                {r.cond && <span className="when"> {r.cond}</span>}
                <span className="do">{r.act}</span>
              </span>
            )
          })
        ) : (
          <span className="rule when">{t('No effect')}</span>
        )}
        <span className="mark" style={{ color: `var(--t${f.type})` }} dangerouslySetInnerHTML={{ __html: ICON[f.type] }} />
      </div>
      <div className="cid">{f.id}</div>
      {vc.gone ? <div className="tag">{t('Discarded')} · {t(vc.gone)}</div> : off && <div className="tag off">{t('Off')} · {off}</div>}
    </button>
  )
}

function CardSheet({ game, side, card }: { game: GameState; side: Side; card: CardInst }) {
  const f = cardFacts(game, side, card)
  return (
    <>
      <div className="big">
        <CardView vc={{ card }} game={game} side={side} onOpen={() => undefined} />
      </div>
      <div className="info">
        <b>{f.id}</b>
        <span>
          {t({ P: 'Punch', K: 'Kick', S: 'Skill' }[f.type])} · {f.total} dmg{f.cost > 0 ? ` · ${t('costs {n} {res}', { n: f.cost, res: f.costName })}` : ''}
        </span>
        <p>{f.text || t('No effect. Plain damage.')}</p>
        {f.short != null && <p>{t('Not enough {res}: hits for {pct}% dmg, effect off, drawbacks still fire.', { res: f.costName, pct: f.short })}</p>}
        {f.off && f.short == null && <p>{t('Effect off right now ({why}). The card still deals its damage.', { why: f.off })}</p>}
        {f.missing && <p>⚠ {t('This effect has no code yet; it plays as plain damage.')}</p>}
        <p>{t('Tap anywhere to close.')}</p>
      </div>
    </>
  )
}
