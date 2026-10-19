import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDeck, createGame, fillText, isEffectMissing, legalActions, resolveTuning, pickSmartAction, rulesFromConfig, STYLES, resolveTurn, tuningFromRows, type Action, type CardRowLike, type GameState, type Side } from '../engine'
import { capability, type Sample } from '../online/claude'
import type { Seat } from '../online/match'
import { askTuktah } from '../online/tuktah'
import { Arena, type Turn } from './Arena'
import { Online } from './Online'
import { ChampionSelect, type FoeKind } from './select/ChampionSelect'
import { CHAMP_INFO } from './select/info'
import { useGameSettings } from './settings'
import { TimerSetting, TurnTimer } from './timer/TurnTimer'
import { Tutorial } from './tutorial/Tutorial'

/** Who you play against: the built-in AI, Claude as ตุ๊กตา (Artifact `sample`), or a person online (Artifact `db`). */
type Foe = FoeKind

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
  const [tutorial, setTutorial] = useState(false)
  // new match = new id, so the turn timer restarts even when the turn number repeats
  const [match, setMatch] = useState(0)
  const [settings] = useGameSettings()

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
    setMatch((m) => m + 1)
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

  const champTitle = (id: string) => data.champions.find((c) => c.id === id)?.name ?? id
  const fill = (text: string, group: string) => {
    const c = data.champions.find((x) => x.id === group.slice(0, 2))
    return fillText(text, group, tuning, c ? { hpStart: c.hp_start, hpMax: c.hp_max } : {})
  }

  if (tutorial) {
    return (
      <Tutorial
        champ={picks.p1}
        setupOf={setup}
        gameOpts={gameOpts}
        names={champTitle}
        comboText={CHAMP_INFO[picks.p1] ? fill(CHAMP_INFO[picks.p1].combo, picks.p1) : ''}
        onExit={() => setTutorial(false)}
      />
    )
  }

  if (!game) {
    return (
      <ChampionSelect
        champions={data.champions}
        stylesOf={stylesOf}
        styleText={styleText}
        fill={fill}
        picks={picks}
        setChamp={(side, id) => {
          setPicks({ ...picks, [side]: id })
          setStylePick({ ...stylePick, [side]: null })
        }}
        styleKey={styleKey}
        setStyle={(side, key) => setStylePick({ ...stylePick, [side]: key })}
        foe={foe}
        setFoe={setFoe}
        canTuktah={!!sample}
        canOnline={hasDb}
        deckSize={(id) => deckOf(id).filter((d) => !d.styleOnly || d.styleOnly.startsWith('!')).length}
        missing={missingOf}
        onStart={start}
        onTutorial={() => setTutorial(true)}
      />
    )
  }

  const champName = (side: Side) => data.champions.find((c) => c.id === game.players[side].championId)?.name ?? game.players[side].championId
  const styleOf = (side: Side) => {
    const key = game.players[side].style
    return key ? (STYLES[key]?.name ?? key) : ''
  }

  const legal = legalActions(game, 'p1')
  return (
    <>
      <TurnTimer
        key={`${match}:${game.turn}`}
        seconds={settings.timerSec}
        running={settings.timer && !turn && !thinking && !game.winner}
        onTimeout={() => play(legal.includes('block') ? 'block' : legal[0])}
      />
      <Arena
        game={game}
        turn={turn}
        names={{ p1: champName('p1'), p2: champName('p2') }}
        styleNames={{ p1: styleOf('p1'), p2: styleOf('p2') }}
        styleTexts={{ p1: styleText[game.players.p1.style ?? ''] ?? '', p2: styleText[game.players.p2.style ?? ''] ?? '' }}
        settingsExtra={<TimerSetting />}
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
    </>
  )
}
