// Online 1v1 inside the claude.ai Artifact: rooms and picks live in the Artifact's shared db (see online/match.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action, ChampionSetup, Side } from '../engine'
import { capability, type Db } from '../online/claude'
import { moveId, newCode, newSecret, replay, sha256, type MatchDoc, type MoveDoc, type Seat } from '../online/match'
import { view } from '../online/mirror'
import { Arena, type Turn } from './Arena'

type Props = {
  /** the Champion and Style picked on the select screen */
  mine: { champ: string; style: string }
  setupOf: (s: Seat) => ChampionSetup
  champName: (id: string) => string
  styleName: (key: string) => string
  onQuit: () => void
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private window: a reload mid-turn loses the pick, the player picks again */
    }
  },
}

export function Online(props: Props) {
  const [db, setDb] = useState<Db | null | undefined>(undefined)
  const [uid, setUid] = useState<string>('')
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([capability<Db>('db'), capability<{ id(): Promise<string | null> }>('user')]).then(async ([d, u]) => {
      const id = (await u?.id().catch(() => null)) ?? store.get('ccc-guest') ?? `guest-${newCode()}`
      store.set('ccc-guest', id)
      if (live) {
        setUid(id)
        setDb(d)
      }
    })
    return () => {
      live = false
    }
  }, [])

  if (db === undefined) return <div className="panel narrow-wide">Connecting…</div>
  if (!db)
    return (
      <div className="panel narrow-wide">
        <h2>Online</h2>
        <p>Online play needs the game opened on claude.ai, signed in, with edit access to it.</p>
        <button onClick={props.onQuit}>Back</button>
      </div>
    )
  if (!code) return <Lobby db={db} uid={uid} {...props} onJoin={setCode} />
  return <Match db={db} uid={uid} code={code} {...props} onQuit={() => setCode(null)} />
}

function Lobby({ db, uid, mine, champName, styleName, onJoin, onQuit }: Props & { db: Db; uid: string; onJoin: (code: string) => void }) {
  const [open, setOpen] = useState<MatchDoc[]>([])
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const seat: Seat = { uid, champ: mine.champ, style: mine.style }

  useEffect(
    () =>
      db
        .collection('matches')
        .where('status', '==', 'waiting')
        .orderBy('created', 'desc')
        .limit(10)
        .onSnapshot(
          (s) => setOpen(s.docs.map((d) => d.data() as MatchDoc)),
          () => setOpen([]),
        ),
    [db],
  )

  async function create() {
    const c = newCode()
    const m: MatchDoc = { code: c, status: 'waiting', seed: (Math.random() * 2 ** 31) | 0, created: Date.now(), p1: seat, p2: null }
    try {
      await db.doc(`matches/${c}`).set(m)
      store.set(`ccc-seat-${c}`, 'p1')
      onJoin(c)
    } catch {
      setErr("Couldn't create a room (no edit access to this game?)")
    }
  }

  async function join(c: string) {
    c = c.trim().toUpperCase()
    const snap = await db.doc(`matches/${c}`).get().catch(() => null)
    const m = snap?.exists ? (snap.data() as MatchDoc) : null
    if (!m) return setErr(`No room ${c}`)
    const mySeat = store.get(`ccc-seat-${c}`)
    if (mySeat || m.p1.uid === uid || m.p2?.uid === uid) return onJoin(c) // back into my own room
    if (m.p2) return setErr(`Room ${c} is full`)
    try {
      await db.doc(`matches/${c}`).update({ p2: seat, status: 'playing' })
      store.set(`ccc-seat-${c}`, 'p2')
      onJoin(c)
    } catch {
      setErr("Couldn't join (no edit access to this game?)")
    }
  }

  return (
    <div className="panel narrow-wide">
      <h2>Online 1v1</h2>
      <p className="muted">
        You play {champName(mine.champ)}
        {mine.style ? ` · ${styleName(mine.style)}` : ''}. Change it on the select screen.
      </p>
      <button onClick={create}>Create room</button>
      <label>
        Room code
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="ABCDE" maxLength={5} />
      </label>
      <button onClick={() => join(input)} disabled={input.trim().length < 5}>
        Join
      </button>
      {err && <p className="muted">{err}</p>}
      {open.length > 0 && (
        <>
          <h3>Open rooms</h3>
          {open.map((m) => (
            <button key={m.code} className="alt" onClick={() => join(m.code)}>
              {m.code} · {champName(m.p1.champ)}
              {m.p1.uid === uid ? ' (yours)' : ''}
            </button>
          ))}
        </>
      )}
      <button className="alt" onClick={onQuit}>
        Back
      </button>
    </div>
  )
}

function Match({ db, uid, code, setupOf, champName, styleName, onQuit }: Props & { db: Db; uid: string; code: string }) {
  const [match, setMatch] = useState<MatchDoc | null>(null)
  const [moves, setMoves] = useState<Record<string, MoveDoc>>({})
  const [shown, setShown] = useState<number | null>(null) // turns already played back on screen
  const [turn, setTurn] = useState<Turn | null>(null)
  const revealing = useRef<string | null>(null)

  useEffect(() => db.doc(`matches/${code}`).onSnapshot((s) => setMatch(s.exists ? (s.data() as MatchDoc) : null)), [db, code])
  useEffect(
    () =>
      db
        .collection(`matches/${code}/moves`)
        .onSnapshot((s) => setMoves(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as MoveDoc])))),
    [db, code],
  )

  const seat: Side | null = useMemo(() => {
    const saved = store.get(`ccc-seat-${code}`)
    if (saved === 'p1' || saved === 'p2') return saved
    if (!match) return null
    return match.p1.uid === uid ? 'p1' : match.p2?.uid === uid ? 'p2' : null
  }, [match, uid, code])

  const played = useMemo(() => (match ? replay(match, moves, setupOf) : null), [match, moves, setupOf])
  const t = played ? played.states.length - 1 : 0 // the turn being picked now
  const mine = seat ? moves[moveId(t, seat)] : undefined
  const theirs = seat ? moves[moveId(t, seat === 'p1' ? 'p2' : 'p1')] : undefined

  // both picks locked: reveal mine
  useEffect(() => {
    if (!seat || !mine || mine.reveal || !theirs) return
    const secret = store.get(`ccc-secret-${code}-${t}`)
    if (!secret || sha256(secret) !== mine.hash || revealing.current === `${t}`) return
    revealing.current = `${t}`
    db.doc(`matches/${code}/moves/${moveId(t, seat)}`)
      .update({ reveal: secret })
      .catch(() => (revealing.current = null))
  }, [db, code, seat, t, mine, theirs])

  // joining (or reloading) mid-match starts from the current turn, no replay of the whole match
  useEffect(() => {
    if (played && shown === null) setShown(played.actions.length)
  }, [played, shown])

  // a newly resolved turn: play it back
  useEffect(() => {
    if (!played || !seat || turn || shown === null || shown >= played.actions.length) return
    const a = played.actions[shown]
    setTurn({ prev: view(played.states[shown], seat), next: view(played.states[shown + 1], seat), actions: seat === 'p1' ? a : { p1: a.p2, p2: a.p1 } })
  }, [played, seat, turn, shown])

  async function pick(a: Action) {
    if (!seat || mine) return
    const secret = newSecret(a)
    store.set(`ccc-secret-${code}-${t}`, secret)
    await db.doc(`matches/${code}/moves/${moveId(t, seat)}`).set({ t, side: seat, hash: sha256(secret) })
  }

  if (!match) return <div className="panel narrow-wide">Loading room {code}…</div>
  if (!seat)
    return (
      <div className="panel narrow-wide">
        <p>You are watching room {code}; both seats are taken.</p>
        <button onClick={onQuit}>Back</button>
      </div>
    )
  if (!match.p2 || !played || shown === null)
    return (
      <div className="panel narrow-wide">
        <h2>Room {code}</h2>
        <p>Waiting for an opponent. Send them this code; they open the game, pick Online and join {code}.</p>
        <button className="alt" onClick={onQuit}>
          Leave
        </button>
      </div>
    )

  const foeSeat = seat === 'p1' ? match.p2 : match.p1
  const meSeat = seat === 'p1' ? match.p1 : match.p2
  const game = view(played.states[Math.min(shown, played.states.length - 1)], seat)
  const waiting = !!mine && !turn && shown >= played.actions.length

  return (
    <Arena
      game={game}
      turn={turn}
      names={{ p1: champName(meSeat.champ), p2: champName(foeSeat.champ) }}
      styleNames={{ p1: styleName(meSeat.style), p2: styleName(foeSeat.style) }}
      foe={foeSeat.uid === 'tuktah' ? 'ตุ๊กตา' : 'Rival'}
      busy={!!mine}
      banner={waiting ? (theirs ? 'Revealing…' : 'Waiting for opponent…') : undefined}
      onAction={pick}
      onDone={() => {
        setShown((n) => (n ?? 0) + 1)
        setTurn(null)
      }}
      onQuit={onQuit}
    />
  )
}
