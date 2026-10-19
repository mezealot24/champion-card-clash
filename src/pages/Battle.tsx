import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDeck, createGame, fillText, isEffectMissing, resolveTuning, pickSmartAction, rulesFromConfig, STYLES, resolveTurn, tuningFromRows, type Action, type CardRowLike, type GameState, type Side } from '../engine'
import { capability, type Sample } from '../online/claude'
import type { Seat } from '../online/match'
import { askTuktah } from '../online/tuktah'
import { Arena, type Turn } from './Arena'
import { Online } from './Online'

/** Who you play against: the built-in AI, Claude as ตุ๊กตา (Artifact `sample`), or a person online (Artifact `db`). */
type Foe = 'ai' | 'tuktah' | 'online'

export type Champ = { id: string; name: string; hp_start: number; hp_max: number; params?: Record<string, unknown> | null }
export type Row = CardRowLike & { champion_id: string }
export type StyleRow = { champion_id: string; slot: number; name: string; effect: string; params?: Record<string, unknown> | null }
/** config = game_config rows (rules the engine reads, see engine/tuning.ts RULE_KEYS); params = Admin tuning overrides */
export type BattleData = { champions: Champ[]; cards: Row[]; styles?: StyleRow[]; config?: { key: string; value: unknown }[] }

/** The game screen. Data comes from Supabase (BattlePage) or a bundled snapshot (play.tsx). */
export function Battle({ data }: { data: BattleData }) {
  const [picks, setPicks] = useState({ p1: 'BR', p2: 'BR' })
  // Style per side: "CHAMP:slot", or '' for none. Defaults to slot 1 when it works in the engine.
  const [stylePick, setStylePick] = useState<Record<Side, string | null>>({ p1: null, p2: null })
  const stylesOf = (id: string) => (data.styles ?? []).filter((s) => s.champion_id === id && s.name)
  const styleKey = (side: Side) => stylePick[side] ?? (STYLES[`${picks[side]}:1`] ? `${picks[side]}:1` : '')
  const [game, setGame] = useState<GameState | null>(null)
  // a resolved turn the arena is still playing back; game moves to turn.next when it's done
  const [turn, setTurn] = useState<Turn | null>(null)
  const [foe, setFoe] = useState<Foe>('ai')
  const [online, setOnline] = useState(false)
  const [sample, setSample] = useState<Sample | null>(null)
  const [hasDb, setHasDb] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [line, setLine] = useState('')
  const [history, setHistory] = useState<{ mine: Action; theirs: Action }[]>([])

  useEffect(() => {
    capability<Sample>('sample').then(setSample)
    capability('db').then((d) => setHasDb(!!d))
  }, [])

  // Champion / Style numbers and rules from the DB (Admin), filled in with the engine's defaults by createGame
  const gameOpts = useMemo(() => ({ tuning: tuningFromRows(data.champions, data.styles), rules: rulesFromConfig(data.config) }), [data])
  const deckOf = (id: string) => buildDeck(data.cards.filter((c) => c.champion_id === id))
  const missingOf = (id: string) =>
    data.cards.filter((c) => c.champion_id === id && c.in_deck !== false && isEffectMissing(c.id, c.effect, c.effect_json)).length

  const setup = (id: string) => {
    const c = data.champions.find((x) => x.id === id)!
    return { championId: id, hpStart: c.hp_start, hpMax: c.hp_max, deck: deckOf(id) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seatSetup = useCallback((s: Seat) => ({ ...setup(s.champ), style: s.style || undefined }), [data])
  // Style text with its {numbers} filled from the tuning (Admin), as players see it
  const tuning = useMemo(() => resolveTuning(gameOpts.tuning), [gameOpts])
  const styleText: Record<string, string> = useMemo(
    () =>
      Object.fromEntries(
        (data.styles ?? []).map((s) => {
          const c = data.champions.find((x) => x.id === s.champion_id)
          return [`${s.champion_id}:${s.slot}`, fillText(s.effect, `${s.champion_id}:${s.slot}`, tuning, c ? { hpStart: c.hp_start, hpMax: c.hp_max } : {})]
        }),
      ),
    [data, tuning],
  )

  function start() {
    if (foe === 'online') return setOnline(true)
    setTurn(null)
    setLine('')
    setHistory([])
    setGame(createGame({ ...setup(picks.p1), style: styleKey('p1') || undefined }, { ...setup(picks.p2), style: styleKey('p2') || undefined }, gameOpts))
  }

  async function play(action: Action) {
    if (!game || turn || thinking) return
    let p2 = pickSmartAction(game, 'p2')
    if (foe === 'tuktah' && sample) {
      // Claude picks from the board alone; the player's pick stays here until both are locked
      setThinking(true)
      const move = await askTuktah(sample, game, 'p2', history, styleText)
      setThinking(false)
      if (move) p2 = move.action
      setLine(move?.line || (move ? '' : 'ตุ๊กตาหลุดไปแป๊บ ให้ AI เล่นแทนเทิร์นนี้นะคะ'))
    }
    const actions = { p1: action, p2 }
    setHistory((h) => [...h, { mine: p2, theirs: action }])
    setTurn({ prev: game, next: resolveTurn(game, actions), actions })
  }

  if (online) {
    return (
      <Online
        mine={{ champ: picks.p1, style: styleKey('p1') }}
        setupOf={seatSetup}
        gameOpts={gameOpts}
        champName={(id) => data.champions.find((c) => c.id === id)?.name ?? id}
        styleName={(key) => (key ? (STYLES[key]?.name ?? key) : '')}
        onQuit={() => setOnline(false)}
      />
    )
  }

  if (!game) {
    return (
      <div className="panel narrow-wide">
        <h2>Battle</h2>
        <label>
          Opponent
          <select value={foe} onChange={(e) => setFoe(e.target.value as Foe)}>
            <option value="ai">AI</option>
            <option value="tuktah" disabled={!sample}>
              ตุ๊กตา (Claude){sample ? '' : ' · open on claude.ai'}
            </option>
            <option value="online" disabled={!hasDb}>
              Online 1v1{hasDb ? '' : ' · open on claude.ai'}
            </option>
          </select>
        </label>
        {(['p1', 'p2'] as const).filter((side) => side === 'p1' || foe !== 'online').map((side) => (
          <label key={side}>
            {side === 'p1' ? 'Your Champion' : `${foe === 'tuktah' ? 'ตุ๊กตา' : 'AI'}'s Champion`}
            <select
              value={picks[side]}
              onChange={(e) => {
                setPicks({ ...picks, [side]: e.target.value })
                setStylePick({ ...stylePick, [side]: null })
              }}
            >
              {data.champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id}) · HP {c.hp_start}/{c.hp_max} · {deckOf(c.id).filter((d) => !d.styleOnly || d.styleOnly.startsWith('!')).length} ใบ
                  {missingOf(c.id) ? ` · ⚠ ${missingOf(c.id)} effect ยังไม่ทำงาน` : ''}
                </option>
              ))}
            </select>
            <select value={styleKey(side)} onChange={(e) => setStylePick({ ...stylePick, [side]: e.target.value })} title="Style (Passive)">
              <option value="">ไม่ใช้ Style</option>
              {stylesOf(picks[side]).map((s) => {
                const key = `${s.champion_id}:${s.slot}`
                return (
                  <option key={key} value={key} disabled={!STYLES[key]}>
                    Style: {s.name}
                    {STYLES[key] ? '' : ' (ยังไม่ทำงาน)'}
                  </option>
                )
              })}
            </select>
            {stylesOf(picks[side]).find((s) => `${s.champion_id}:${s.slot}` === styleKey(side)) && (
              <span className="muted">{styleText[styleKey(side)]}</span>
            )}
          </label>
        ))}
        <button onClick={start}>{foe === 'online' ? 'Find a match' : 'Start'}</button>
      </div>
    )
  }

  const champName = (side: Side) => data.champions.find((c) => c.id === game.players[side].championId)?.name ?? game.players[side].championId
  const styleOf = (side: Side) => {
    const key = game.players[side].style
    return key ? (STYLES[key]?.name ?? key) : ''
  }

  return (
    <Arena
      game={game}
      turn={turn}
      names={{ p1: champName('p1'), p2: champName('p2') }}
      styleNames={{ p1: styleOf('p1'), p2: styleOf('p2') }}
      styleTexts={{ p1: styleText[game.players.p1.style ?? ''] ?? '', p2: styleText[game.players.p2.style ?? ''] ?? '' }}
      onAction={play}
      foe={foe === 'tuktah' ? 'ตุ๊กตา' : 'AI'}
      busy={thinking}
      banner={thinking ? 'ตุ๊กตากำลังคิด…' : line || undefined}
      bannerFades={!thinking}
      onDone={() => {
        if (turn) setGame(turn.next)
        setTurn(null)
      }}
      onRestart={start}
      onQuit={() => {
        setTurn(null)
        setGame(null)
      }}
    />
  )
}
