import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { bossSetup, type BossClass, buildDeck, createGame, randomLoadout, fillText, isEffectMissing, legalActions, MINORS, OATHS, ENDURANCE_TEXT, resolveTuning, pickSmartAction, rulesFromConfig, STYLES, resolveTurn, TREES, tuningFromRows, type Action, type CardRowLike, type GameState, type Loadout, type Side } from '../engine'
import { t, useLang } from '../i18n'
import { capability, type Sample } from '../online/claude'
import type { Seat } from '../online/match'
import { askTuktah } from '../online/tuktah'
import { Arena, type Turn } from './Arena'
import { addClear, BOSS, cleared, isBoss, loadRun, newRun, randomFoe, rollBossKit, saveRun, tierOf, type ArcadeRun, type Foe as FoePick, type Tier } from './arcade/arcade'
import { ArcadeContinue } from './arcade/ArcadeContinue'
import { ArcadeLadder } from './arcade/ArcadeLadder'
import { TitleMenu, type Mode } from './menu/TitleMenu'
import { DeckBuilder } from './deck/DeckBuilder'
import { deckRows, deckRulesFromConfig, loadDeck } from './deck/deck'
import { activePreset, applyPreset, presetViews, statsOf } from './deck/presets'
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
  const lang = useLang()
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
  // title menu first (null); then Arcade, Versus or Multiplayer
  const [mode, setMode] = useState<Mode | null>(null)
  // Versus: the opponent is rolled at random unless the player picks one (Q 2026-10-28)
  const [foeRandom, setFoeRandom] = useState(true)
  const [run, setRunState] = useState<ArcadeRun | null>(loadRun)
  const setRun = (r: ArcadeRun | null) => {
    setRunState(r)
    saveRun(r)
  }
  const [ladder, setLadder] = useState(false)
  // Arcade Continue after a loss: rework the Ascendancy tree and Oath before the retry (Q 2026-10-29)
  const [rebuild, setRebuild] = useState(false)
  // AI strength of the current match (Arcade stage); null = the normal AI
  const [tier, setTier] = useState<Tier | null>(null)
  // the Arcade match whose win was already counted
  const counted = useRef(0)

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
  const styleTextIn = useCallback(
    (tr: (en: string) => string): Record<string, string> =>
      Object.fromEntries(
        (data.styles ?? []).map((s) => {
          const c = data.champions.find((x) => x.id === s.champion_id)
          const key = `${s.champion_id}:${s.slot}`
          // the DB text is the English key (th.ts); a Style text edited in Admin shows in English until it has a Thai line
          const text = fillText(tr(s.effect), key, tuning, c ? { hpStart: c.hp_start, hpMax: c.hp_max } : {})
          // Lifeline plays with Endurance: explain it next to the passive
          return [key, key === 'TK:1' ? `${text}\n\n${fillText(tr(ENDURANCE_TEXT), key, tuning)}` : text]
        }),
      ),
    [data, tuning],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const styleText = useMemo(() => styleTextIn(t), [styleTextIn, lang])
  // Tuktah (the Claude opponent) reads the rules in English
  const styleTextEn = useMemo(() => styleTextIn((en) => en), [styleTextIn])

  // every (Champion, Style) the engine can play: Arcade stages and Versus' Random pick from it
  const pool: FoePick[] = data.champions.flatMap((c) => playable(c.id).map((style) => ({ champ: c.id, style })))

  function start() {
    const myStyle = styleKey('p1') || undefined
    // the steps only offer Fight when all is set; an old save that slipped through goes back to the step it misses
    const open = firstOpenStep(picks.p1, myStyle, ascPoints, saved)
    if (open !== 'fight') {
      setGame(null)
      return setStep(open)
    }
    if (mode === 'multi') return setOnline(true)
    if (mode === 'arcade') {
      setRun(newRun(picks.p1, myStyle ?? '', pool))
      setGame(null)
      return setLadder(true)
    }
    let p2 = picks.p2
    let p2Style = styleKey('p2') || undefined
    const rolled = foeRandom ? randomFoe(pool) : undefined
    if (rolled) {
      p2 = rolled.champ
      p2Style = rolled.style
      setPicks((p) => ({ ...p, p2 }))
      setFoeStyle(rolled.style)
    }
    launch(picks.p1, myStyle, p2, p2Style, null)
  }

  /** bossKit = the Arcade boss plays every class instead of `them` (no Oath, see arcade.ts BOSS) */
  function launch(me: string, myStyle: string | undefined, them: string, theirStyle: string | undefined, aiTier: Tier | null, banner = '', bossKit?: BossClass[]) {
    setTurn(null)
    setLine(banner)
    setHistory([])
    setMatch((m) => m + 1)
    setTier(aiTier)
    const foeL = bossKit ? undefined : randomLoadout(them, theirStyle, ascPoints)
    setFoeLoadout(foeL)
    const foeSeat = bossKit
      ? bossSetup(t(BOSS.name), BOSS.hp, bossKit, Object.fromEntries(bossKit.map((c) => [c.champ, deckOf(c.champ)])), BOSS.perClass)
      : { ...setup(them), style: theirStyle, loadout: foeL }
    setGame(createGame({ ...setup(me), deck: buildDeck(myDeck(me, myStyle).rows), style: myStyle, loadout: loadoutFor(me, myStyle, ascPoints) }, foeSeat, gameOpts))
  }

  /** Fight the run's next Arcade stage (again, after a Continue). */
  function fightStage(r: ArcadeRun) {
    const foeAt = r.stages[r.at]
    if (!foeAt) return
    // the loadout changed since the run began and misses a piece: finish it first (Start then begins a new run)
    const open = firstOpenStep(r.champ, r.style, ascPoints, loadLoadout(r.champ))
    if (open !== 'fight') {
      setPicks((p) => ({ ...p, p1: r.champ }))
      setLadder(false)
      setGame(null)
      return setStep(open)
    }
    const aiTier = tierOf(r.at, r)
    const banner = t('Stage {n}/{total} · {tier}', { n: r.at + 1, total: r.stages.length, tier: t(aiTier.name) })
    if (isBoss(foeAt)) {
      // a new kit every try; the Versus picks never hold the boss id
      const kit = rollBossKit(pool)
      if (!kit.length) return
      setPicks({ p1: r.champ, p2: kit[0].champ })
      setFoeStyle(kit[0].style)
      return launch(r.champ, r.style, kit[0].champ, kit[0].style, aiTier, `${banner} · ${t('Final boss: {name}', { name: t(BOSS.name) })}`, kit)
    }
    setPicks({ p1: r.champ, p2: foeAt.champ })
    setFoeStyle(foeAt.style)
    launch(r.champ, r.style, foeAt.champ, foeAt.style, aiTier, banner)
  }

  function pickMode(m: Mode) {
    setMode(m)
    setStep('champion')
    if (m === 'multi') setFoe('online')
    else if (foe === 'online' || m === 'arcade') setFoe('ai')
    if (m === 'arcade' && run && !cleared(run)) {
      setPicks((p) => ({ ...p, p1: run.champ }))
      setLadder(true)
    }
  }

  // an Arcade win moves the ladder up as soon as the K.O. lands, so a closed tab keeps it
  useEffect(() => {
    if (mode !== 'arcade' || !tier || !run || !game?.winner || turn || counted.current === match) return
    counted.current = match
    if (game.winner !== 'p1') return
    const r = { ...run, at: run.at + 1 }
    setRun(r)
    if (cleared(r)) addClear(r.champ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, turn])

  async function play(action: Action) {
    if (!game || turn || thinking) return
    let p2 = pickSmartAction(game, 'p2', Math.random, tier ? { depth: tier.depth, noise: tier.noise } : {})
    // the Arcade "Stage n/5" banner is for the first turn only (the Arena shows a banner again every turn while it is set)
    setLine('')
    if (mode === 'versus' && foe === 'tuktah' && sample) {
      // Claude picks from the board alone; the player's pick stays here until both are locked
      setThinking(true)
      const move = await askTuktah(sample, game, 'p2', history, styleTextEn)
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

  if (!game && !mode) {
    return <TitleMenu champions={data.champions} run={run} canOnline={hasDb} onPick={pickMode} onTutorial={() => setTutorial(true)} />
  }

  if (!game && mode === 'arcade' && rebuild && run) {
    const foeAt = run.stages[run.at]
    return (
      <ArcadeContinue
        run={run}
        champName={champTitle(run.champ)}
        styleName={STYLES[run.style]?.name ?? run.style}
        foeName={!foeAt ? '' : isBoss(foeAt) ? t(BOSS.name) : `${champTitle(foeAt.champ)} · ${STYLES[foeAt.style]?.name ?? foeAt.style}`}
        saved={loadLoadout(run.champ)}
        setSaved={(l) => {
          saveLoadout(run.champ, l)
          bump()
        }}
        points={ascPoints}
        fill={fill}
        onFight={() => {
          setRebuild(false)
          fightStage(run)
        }}
        onGiveUp={() => {
          setRun(null)
          setRebuild(false)
          setMode(null)
        }}
      />
    )
  }

  if (!game && mode === 'arcade' && ladder && run) {
    return (
      <ArcadeLadder
        run={run}
        champName={champTitle}
        styleName={(key) => STYLES[key]?.name ?? key}
        onFight={() => fightStage(run)}
        onNewRun={() => {
          setPicks((p) => ({ ...p, p1: run.champ }))
          setRun(null)
          setLadder(false)
          setStep('champion')
        }}
        onMenu={() => {
          setLadder(false)
          setMode(null)
        }}
      />
    )
  }

  if (!game || !mode) {
    const meChamp = data.champions.find((c) => c.id === picks.p1)
    const myRows = data.cards.filter((c) => c.champion_id === picks.p1)
    const myStyle = styleKey('p1') || undefined
    const presets = meChamp ? presetViews(meChamp, myRows, playable(picks.p1), ascPoints, deckRules) : []
    const active = activePreset(picks.p1, saved, myRows, deckRules)
    return (
      <ChampionSelect
        mode={mode ?? 'versus'}
        foeRandom={foeRandom}
        setFoeRandom={setFoeRandom}
        onMenu={() => setMode(null)}
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
        presets={presets}
        activePreset={active?.id}
        onPreset={(p) => {
          setSaved(applyPreset(picks.p1, p, myRows, saved))
          setStep('fight')
        }}
        // a build that is exactly a preset shows the preset's numbers, so the two screens agree
        myStats={active ? (presets.find((v) => v.preset.id === active.id)?.stats ?? null) : meChamp && myStyle ? statsOf(meChamp, myRows, loadDeck(picks.p1), myStyle, saved.oath, loadoutFor(picks.p1, myStyle, ascPoints)?.asc ?? [], deckRules) : null}
      />
    )
  }

  // the Arcade boss shows its own name; its Style line says it plays every class
  const champName = (side: Side) => game.players[side].boss?.name ?? champTitle(game.players[side].championId)
  const styleOf = (side: Side) => {
    const p = game.players[side]
    if (p.boss) return t('Every class · {n} Styles', { n: p.boss.classes.length })
    const key = p.style
    return key ? (STYLES[key]?.name ?? key) : ''
  }
  // the boss's Style sheet: each class's Style and capstone
  const bossText = (side: Side) => {
    const p = game.players[side]
    if (!p.boss) return undefined
    return p.boss.classes
      .map((c) => {
        const key = p.boss!.styles[c]
        const cap = (p.perks ?? []).find((k) => k.startsWith(`asc:${key}:`))?.split(':')[3]
        const node = cap ? TREES[key]?.nodes.find((n) => n.id === cap) : undefined
        return `${champTitle(c)} · ${STYLES[key]?.name ?? key}: ${styleText[key] ?? ''}${node ? ` ${t('Capstone')} ${node.name}: ${fill(node.text, key)} ${t('Cost')}: ${fill(node.cost ?? '', key)}` : ''}`
      })
      .join('\n\n')
  }

  // Arcade result buttons: a win goes back to the ladder; a loss can Continue the same stage or give up the run
  const arcade = mode === 'arcade' && !!tier && !!run
  const won = game.winner === 'p1'
  const lost = !!game.winner && !won
  const toLadder = () => {
    setTurn(null)
    setGame(null)
    setLadder(true)
  }
  const arcadeNext = () => {
    if (!run) return
    if (won) return toLadder()
    // Continue: rework the build on its own screen, then retry the same stage
    setRun({ ...run, continues: run.continues + 1 })
    setTurn(null)
    setGame(null)
    setRebuild(true)
  }
  const arcadeQuit = () => {
    if (won || lost) {
      // a win is already saved: Menu keeps the run; Give up after a loss ends it
      if (lost) setRun(null)
      setTurn(null)
      setGame(null)
      setLadder(false)
      return setMode(null)
    }
    toLadder()
  }
  const arcadeLabels = arcade
    ? {
        restart: won ? (run && cleared(run) ? t('Arcade clear!') : t('Next stage')) : t('Continue'),
        quit: won ? t('Menu') : lost ? t('Give up') : undefined,
        quitMenu: t('Quit to the ladder (progress kept)'),
        note: t('Stage {n}/{total} · {tier}', { n: Math.min(run!.at + (won ? 0 : 1), run!.stages.length), total: run!.stages.length, tier: t(tier!.name) }),
      }
    : undefined

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
          p2: bossText('p2') ?? [styleText[game.players.p2.style ?? ''] ?? '', ...loadoutLines(game.players.p2.championId, game.players.p2.style, foeLoadout).map((l) => `${t(l.label)}: ${l.value}.`)].filter(Boolean).join(' '),
        }}
        settingsExtra={<TimerSetting />}
        onAction={play}
        foe={mode === 'versus' && foe === 'tuktah' ? t('Tuktah') : t('AI')}
        labels={arcadeLabels}
        busy={thinking}
        banner={thinking ? t('Tuktah is thinking…') : line || undefined}
        bannerFades={!thinking}
        onDone={() => {
          if (turn) setGame(turn.next)
          setTurn(null)
        }}
        onRestart={arcade ? arcadeNext : start}
        onQuit={arcade ? arcadeQuit : () => {
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
