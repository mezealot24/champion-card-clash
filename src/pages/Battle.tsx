import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { buildDeck, createGame, randomLoadout, fillText, isEffectMissing, legalActions, MINORS, OATHS, ENDURANCE_TEXT, resolveTuning, pickSmartAction, rulesFromConfig, STYLES, resolveTurn, TREES, tuningFromRows, type Action, type CardRowLike, type GameState, type Loadout, type Side } from '../engine'
import { t, useLang } from '../i18n'
import { capability, type Sample } from '../online/claude'
import type { Seat } from '../online/match'
import { askTuktah } from '../online/tuktah'
import { Arena, type Turn } from './Arena'
import { DeckBuilder } from './deck/DeckBuilder'
import { deckRows, deckRulesFromConfig, loadDeck } from './deck/deck'
import { ascPointsFromConfig, firstOpenStep, loadLoadout, loadoutFor, saveLoadout, savedStyle, type SavedLoadout, type Step } from './loadout/loadout'
import { Online } from './Online'
import { ChampionSelect, type FoeKind } from './select/ChampionSelect'
import { CHAMP_INFO } from './select/info'
import { useGameSettings } from './settings'
import { TimerSetting, TurnTimer } from './timer/TurnTimer'
import { Tutorial } from './tutorial/Tutorial'

/** Who you play against: the built-in AI, Claude as ตุ๊กตา (Artifact `sample`), or a person online (Artifact `db`). */
type Foe = FoeKind

export type Champ = { id: string; name: string; hp_start: number; hp_max: number; params?: Record<string, unknown> | null }
export type Row = CardRowLike & { champion_id: string; name?: string }
export type StyleRow = { champion_id: string; slot: number; name: string; effect: string; params?: Record<string, unknown> | null }
/** config = game_config rows (rules the engine reads, see engine/tuning.ts RULE_KEYS); params = Admin tuning overrides */
export type BattleData = { champions: Champ[]; cards: Row[]; styles?: StyleRow[]; config?: { key: string; value: unknown }[] }

/** Banner when Tuktah gave no usable pick this turn (the AI picks instead). */
const missLine = (code: string) =>
  code === 'rate_limited' ? t('Tuktah needs a breather. The AI plays this turn.')
  : code === 'not_granted' ? t('Claude is not allowed on this page. The AI plays this turn.')
  : t('Tuktah missed this turn. The AI plays it.')

/** The game screen. Data comes from Supabase (BattlePage) or a bundled snapshot (play.tsx). */
export function Battle({ data }: { data: BattleData }) {
  useLang()
  const [picks, setPicks] = useState({ p1: 'BR', p2: 'BR' })
  // A Style is required (Q 2026-10-25). The player's is saved with their loadout ('' until picked, e.g. a save from
  // before the rule); the AI's defaults to slot 1 when it works in the engine.
  const [foeStyle, setFoeStyle] = useState<string | null>(null)
  const stylesOf = (id: string) => (data.styles ?? []).filter((s) => s.champion_id === id && s.name).sort((a, b) => a.slot - b.slot)
  const playable = (id: string) => stylesOf(id).map((s) => `${s.champion_id}:${s.slot}`).filter((k) => STYLES[k])
  // loadLoadout is cached in memory: bump re-reads it after a save
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const saved = loadLoadout(picks.p1)
  const setSaved = (l: SavedLoadout) => {
    saveLoadout(picks.p1, l)
    bump()
  }
  const styleKey = (side: Side) =>
    side === 'p1' ? (savedStyle(saved, playable(picks.p1)) ?? '') : (foeStyle ?? playable(picks.p2)[0] ?? '')
  const [step, setStep] = useState<Step>('champion')
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
  const [deckEdit, setDeckEdit] = useState(false)
  // the AI's loadout for this match (rolled at random each start)
  const [foeLoadout, setFoeLoadout] = useState<Loadout | undefined>()
  // new match = new id, so the turn timer restarts even when the turn number repeats
  const [match, setMatch] = useState(0)
  const [settings] = useGameSettings()

  useEffect(() => {
    // sample is a function: wrap it, or React would call it as a state updater (and every pick would fail)
    capability<Sample>('sample').then((s) => setSample(() => s))
    capability('db').then((d) => setHasDb(!!d))
  }, [])

  // Champion / Style numbers and rules from the DB (Admin), filled in with the engine's defaults by createGame
  const gameOpts = useMemo(() => ({ tuning: tuningFromRows(data.champions, data.styles, data.config), rules: rulesFromConfig(data.config) }), [data])
  const ascPoints = useMemo(() => ascPointsFromConfig(data.config), [data])
  const deckOf = (id: string) => buildDeck(data.cards.filter((c) => c.champion_id === id))
  const deckRules = useMemo(() => deckRulesFromConfig(data.config), [data])
  // the player's own deck (deck builder) when it is still legal for this Style; the AI and online seats use Admin's deck
  const myDeck = (id: string, style?: string) => deckRows(data.cards.filter((c) => c.champion_id === id), loadDeck(id), style, deckRules)
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
          const key = `${s.champion_id}:${s.slot}`
          const text = fillText(s.effect, key, tuning, c ? { hpStart: c.hp_start, hpMax: c.hp_max } : {})
          // Second Wind plays with Endurance: explain it next to the passive
          return [key, key === 'TK:1' ? `${text}\n\n${fillText(ENDURANCE_TEXT, key, tuning)}` : text]
        }),
      ),
    [data, tuning],
  )

  function start() {
    const myStyle = styleKey('p1') || undefined
    // the steps only offer Fight when all is set; an old save that slipped through goes back to the step it misses
    const open = firstOpenStep(picks.p1, myStyle, ascPoints, saved)
    if (open !== 'fight') {
      setGame(null)
      return setStep(open)
    }
    if (foe === 'online') return setOnline(true)
    setTurn(null)
    setLine('')
    setHistory([])
    setMatch((m) => m + 1)
    const foeStyle = styleKey('p2') || undefined
    const foeL = randomLoadout(picks.p2, foeStyle, ascPoints)
    setFoeLoadout(foeL)
    setGame(createGame({ ...setup(picks.p1), deck: buildDeck(myDeck(picks.p1, myStyle).rows), style: myStyle, loadout: loadoutFor(picks.p1, myStyle, ascPoints) }, { ...setup(picks.p2), style: foeStyle, loadout: foeL }, gameOpts))
  }

  async function play(action: Action) {
    if (!game || turn || thinking) return
    let p2 = pickSmartAction(game, 'p2')
    if (foe === 'tuktah' && sample) {
      // Claude picks from the board alone; the player's pick stays here until both are locked
      setThinking(true)
      const move = await askTuktah(sample, game, 'p2', history, styleText)
      setThinking(false)
      if ('action' in move) p2 = move.action
      else console.warn('Tuktah pick failed:', move.miss)
      setLine(move.line || ('action' in move ? '' : missLine(move.miss)))
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

  if (deckEdit) {
    const style = styleKey('p1') || undefined
    return (
      <DeckBuilder
        champ={picks.p1}
        champName={champTitle(picks.p1)}
        rows={data.cards.filter((c) => c.champion_id === picks.p1)}
        style={style}
        styleName={style ? STYLES[style]?.name : undefined}
        rules={deckRules}
        onClose={() => setDeckEdit(false)}
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
          if (side === 'p2') setFoeStyle(null)
        }}
        styleKey={styleKey}
        setStyle={(side, key) => (side === 'p1' ? setSaved({ ...saved, style: key }) : setFoeStyle(key))}
        step={step}
        setStep={setStep}
        saved={saved}
        setSaved={setSaved}
        points={ascPoints}
        foe={foe}
        setFoe={setFoe}
        canTuktah={!!sample}
        canOnline={hasDb}
        deckSize={(id) => (myDeck(id, styleKey('p1') || undefined).custom ? deckRules.size : deckOf(id).filter((d) => !d.styleOnly || d.styleOnly.startsWith('!')).length)}
        deckCustom={(id) => myDeck(id, styleKey('p1') || undefined).custom}
        deckSaved={(id) => !!loadDeck(id)}
        onEditDeck={() => setDeckEdit(true)}
        loadout={loadoutLines(picks.p1, styleKey('p1') || undefined, loadoutFor(picks.p1, styleKey('p1') || undefined, ascPoints))}
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
  const myLoadout = loadoutFor(game.players.p1.championId, game.players.p1.style, ascPoints)
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
        styleTexts={{
          p1: [styleText[game.players.p1.style ?? ''] ?? '', ...loadoutLines(game.players.p1.championId, game.players.p1.style, myLoadout).map((l) => `${t(l.label)}: ${l.value}.`)].filter(Boolean).join(' '),
          p2: [styleText[game.players.p2.style ?? ''] ?? '', ...loadoutLines(game.players.p2.championId, game.players.p2.style, foeLoadout).map((l) => `${t(l.label)}: ${l.value}.`)].filter(Boolean).join(' '),
        }}
        settingsExtra={<TimerSetting />}
        onAction={play}
        foe={foe === 'tuktah' ? t('Tuktah') : t('AI')}
        busy={thinking}
        banner={thinking ? t('Tuktah is thinking…') : line || undefined}
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

/** The loadout as short lines for the Champion screen and the in-match Style sheet. */
function loadoutLines(champ: string, style: string | undefined, l: Loadout | undefined): { label: string; value: string }[] {
  if (!l) return []
  const out: { label: string; value: string }[] = []
  const oath = OATHS[champ]?.find((o) => o.id === l.oath)
  if (oath) out.push({ label: 'Oath', value: oath.name })
  const minor = MINORS.find((m) => m.id === l.minor)
  if (minor) out.push({ label: 'Minor', value: minor.name })
  if (l.asc?.length) {
    const tree = style ? TREES[style] : undefined
    const names = l.asc.map((id) => tree?.nodes.find((n) => n.id === id)?.name ?? id)
    out.push({ label: 'Ascendancy', value: names.join(', ') })
  }
  return out
}
