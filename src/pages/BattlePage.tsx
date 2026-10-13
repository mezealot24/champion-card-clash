import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { must, useAsync } from '../lib/useAsync'
import {
  buildDeck,
  createGame,
  isEffectMissing,
  legalActions,
  pickAiAction,
  resolveTurn,
  type Action,
  type CardInst,
  type CardRowLike,
  type GameState,
  type Side,
} from '../engine'

type Champ = { id: string; name: string; hp_start: number; hp_max: number }
type Row = CardRowLike & { champion_id: string }

const ACTIONS: { action: Action; label: string; hint: string }[] = [
  { action: 'strike', label: 'Strike', hint: 'ตีทั้งมือ ชนะ Charge' },
  { action: 'block', label: 'Block', hint: 'กัน 2 hit แรก ชนะ Strike' },
  { action: 'charge', label: 'Charge', hint: 'จั่ว 1 ชนะ Block' },
]
const NAME: Record<Side, string> = { p1: 'คุณ', p2: 'AI' }

// engine log says p1/p2; show it as คุณ/AI
const readable = (line: string) => line.replace(/\bp1\b/g, NAME.p1).replace(/\bp2\b/g, NAME.p2)

export function BattlePage() {
  const { data, error } = useAsync(async () => {
    const [champions, cards] = await Promise.all([
      supabase.from('champions').select('id, name, hp_start, hp_max').order('sort_order'),
      supabase.from('cards').select('*').order('sort_order'),
    ])
    return { champions: must(champions) as Champ[], cards: must(cards) as unknown as Row[] }
  }, [])
  const [picks, setPicks] = useState({ p1: 'BR', p2: 'BR' })
  const [game, setGame] = useState<GameState | null>(null)
  const [lastLog, setLastLog] = useState<string[]>([])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const deckOf = (id: string) => buildDeck(data.cards.filter((c) => c.champion_id === id))
  const missingOf = (id: string) =>
    data.cards.filter((c) => c.champion_id === id && c.in_deck !== false && isEffectMissing(c.id, c.effect)).length

  function start() {
    const setup = (id: string) => {
      const c = data!.champions.find((x) => x.id === id)!
      return { championId: id, hpStart: c.hp_start, hpMax: c.hp_max, deck: deckOf(id) }
    }
    setGame(createGame(setup(picks.p1), setup(picks.p2)))
    setLastLog([])
  }

  function play(action: Action) {
    if (!game) return
    const next = resolveTurn(game, { p1: action, p2: pickAiAction(game, 'p2') })
    setLastLog(next.log.slice(game.log.length))
    setGame(next)
  }

  if (!game) {
    return (
      <div className="panel narrow-wide">
        <h2>Battle vs AI</h2>
        {(['p1', 'p2'] as const).map((side) => (
          <label key={side}>
            {side === 'p1' ? 'Champion ของคุณ' : 'Champion ของ AI'}
            <select value={picks[side]} onChange={(e) => setPicks({ ...picks, [side]: e.target.value })}>
              {data.champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id}) · HP {c.hp_start}/{c.hp_max} · {deckOf(c.id).length} ใบ
                  {missingOf(c.id) ? ` · ⚠ ${missingOf(c.id)} effect ยังไม่ทำงาน` : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button onClick={start}>เริ่มเกม</button>
      </div>
    )
  }

  const legal = legalActions(game, 'p1')
  const champName = (side: Side) => data.champions.find((c) => c.id === game.players[side].championId)?.name

  return (
    <div className="battle">
      <PlayerPanel game={game} side="p2" title={`AI · ${champName('p2')}`} />

      <div className="panel">
        {game.winner ? (
          <div className="actions">
            <strong>{game.winner === 'draw' ? 'เสมอ!' : game.winner === 'p1' ? 'คุณชนะ! 🎉' : 'AI ชนะ'}</strong>
            <button onClick={start}>เล่นอีกครั้ง</button>
            <button className="secondary" onClick={() => setGame(null)}>เปลี่ยน Champion</button>
          </div>
        ) : (
          <div className="actions">
            <span className="muted">เทิร์น {game.turn}</span>
            {ACTIONS.map(({ action, label, hint }) => (
              <button key={action} title={hint} disabled={!legal.includes(action)} onClick={() => play(action)}>
                {label}
              </button>
            ))}
            <span className="muted">Strike &gt; Charge &gt; Block &gt; Strike</span>
          </div>
        )}
        {lastLog.length > 0 && (
          <ul className="turn-log">
            {lastLog.map((line, i) => (
              <li key={i}>{readable(line)}</li>
            ))}
          </ul>
        )}
        <details>
          <summary className="muted">Log ทั้งเกม</summary>
          <ul className="turn-log">
            {game.log.map((line, i) => (
              <li key={i}>{readable(line)}</li>
            ))}
          </ul>
        </details>
      </div>

      <PlayerPanel game={game} side="p1" title={`คุณ · ${champName('p1')}`} />
    </div>
  )
}

function PlayerPanel({ game, side, title }: { game: GameState; side: Side; title: string }) {
  const p = game.players[side]
  const pct = Math.max(0, Math.round((p.hp / p.maxHp) * 100))
  return (
    <div className="panel">
      <div className="summary">
        <span>{title}</span>
        <span>
          HP {p.hp} / {p.maxHp}
        </span>
        <span className="muted">มือ {p.hand.length} · กอง {p.deck.length}</span>
        {p.statuses.map((s, i) => (
          <span key={i} className="warn">
            {s.kind} ({s.turns})
          </span>
        ))}
      </div>
      <div className="hp-bar">
        <div style={{ width: `${pct}%` }} className={pct <= 30 ? 'low' : ''} />
      </div>
      <div className="hand">
        {p.hand.length === 0 && <span className="muted">มือว่าง</span>}
        {p.hand.map((card, i) => (
          <CardTile key={card.uid} card={card} slot={i + 1} />
        ))}
      </div>
    </div>
  )
}

function CardTile({ card, slot }: { card: CardInst; slot: number }) {
  const { id, type, dmg, effectText } = card.def
  const missing = isEffectMissing(id, effectText)
  return (
    <div className="card-tile">
      <div className="muted">
        ช่อง {slot} · <code>{id} · {type}</code>
      </div>
      <div className="dmg">{dmg}</div>
      {effectText && (
        <div className="effect">
          {missing && <span className="warn" title="effect นี้ยังไม่มีโค้ด เล่นเป็น dmg เปล่า">⚠ </span>}
          {effectText}
        </div>
      )}
    </div>
  )
}
