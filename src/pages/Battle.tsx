import { useState } from 'react'
import { buildDeck, createGame, isEffectMissing, pickSmartAction, STYLES, resolveTurn, type Action, type CardRowLike, type GameState, type Side } from '../engine'
import { Arena, type Turn } from './Arena'

export type Champ = { id: string; name: string; hp_start: number; hp_max: number }
export type Row = CardRowLike & { champion_id: string }
export type StyleRow = { champion_id: string; slot: number; name: string; effect: string }
export type BattleData = { champions: Champ[]; cards: Row[]; styles?: StyleRow[] }

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

  const deckOf = (id: string) => buildDeck(data.cards.filter((c) => c.champion_id === id))
  const missingOf = (id: string) =>
    data.cards.filter((c) => c.champion_id === id && c.in_deck !== false && isEffectMissing(c.id, c.effect, c.effect_json)).length

  function start() {
    const setup = (id: string) => {
      const c = data.champions.find((x) => x.id === id)!
      return { championId: id, hpStart: c.hp_start, hpMax: c.hp_max, deck: deckOf(id) }
    }
    setTurn(null)
    setGame(createGame({ ...setup(picks.p1), style: styleKey('p1') || undefined }, { ...setup(picks.p2), style: styleKey('p2') || undefined }))
  }

  function play(action: Action) {
    if (!game || turn) return
    const actions = { p1: action, p2: pickSmartAction(game, 'p2') }
    setTurn({ prev: game, next: resolveTurn(game, actions), actions })
  }

  if (!game) {
    return (
      <div className="panel narrow-wide">
        <h2>Battle vs AI</h2>
        {(['p1', 'p2'] as const).map((side) => (
          <label key={side}>
            {side === 'p1' ? 'Champion ของคุณ' : 'Champion ของ AI'}
            <select
              value={picks[side]}
              onChange={(e) => {
                setPicks({ ...picks, [side]: e.target.value })
                setStylePick({ ...stylePick, [side]: null })
              }}
            >
              {data.champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id}) · HP {c.hp_start}/{c.hp_max} · {deckOf(c.id).length} ใบ
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
              <span className="muted">{stylesOf(picks[side]).find((s) => `${s.champion_id}:${s.slot}` === styleKey(side))!.effect}</span>
            )}
          </label>
        ))}
        <button onClick={start}>เริ่มเกม</button>
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
      onAction={play}
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
