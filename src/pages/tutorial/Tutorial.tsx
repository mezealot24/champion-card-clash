// Guided first match: a few scripted turns teach Strike / Charge / Block and the signature combo,
// then the normal AI plays the rest of the match. The coach box sits over the Arena; the action to try pulses.
import { useState } from 'react'
import { createGame, legalActions, pickSmartAction, resolveTurn, type Action, type ChampionSetup, type GameState } from '../../engine'
import { Arena, type Turn } from '../Arena'
import { markTutorialDone } from '../settings'
import { comboPattern } from '../select/info'
import { outcomeLine, TUTORIAL, tutorialFoe } from './script'
import './tutorial.css'

type Opts = Parameters<typeof createGame>[2]

export function Tutorial(props: {
  champ: string
  setupOf: (id: string) => ChampionSetup
  gameOpts: Opts
  names: (id: string) => string
  comboText: string
  onExit: () => void
}) {
  const foeId = tutorialFoe(props.champ)
  const newGame = () => createGame(props.setupOf(props.champ), props.setupOf(foeId), props.gameOpts)
  const [game, setGame] = useState<GameState>(newGame)
  const [turn, setTurn] = useState<Turn | null>(null)
  const [step, setStep] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [open, setOpen] = useState(true)

  const cur = TUTORIAL[step]
  const free = !cur
  const legal = legalActions(game, 'p1')
  const want = cur && legal.includes(cur.want) ? cur.want : undefined

  function play(action: Action) {
    if (turn || game.winner) return
    const scripted = cur?.foe && cur.foe !== 'ai' && legalActions(game, 'p2').includes(cur.foe) ? cur.foe : undefined
    const actions = { p1: action, p2: scripted ?? pickSmartAction(game, 'p2') }
    setTurn({ prev: game, next: resolveTurn(game, actions), actions })
    setOpen(false)
  }

  function done() {
    if (!turn) return
    const { actions, next } = turn
    setGame(next)
    setTurn(null)
    if (cur) {
      setFeedback(actions.p1 === cur.want ? `✓ ${cur.good}` : outcomeLine(actions.p1, actions.p2))
      setStep(step + 1)
      if (step + 1 === TUTORIAL.length) markTutorialDone()
    } else setFeedback('')
    setOpen(!next.winner && !!cur)
  }

  const pattern = comboPattern(props.champ)
  return (
    <div className={want && !turn ? `tut-want-${want}` : ''}>
      <Arena
        game={game}
        turn={turn}
        names={{ p1: props.names(props.champ), p2: props.names(foeId) }}
        styleNames={{ p1: 'Tutorial', p2: 'Tutorial' }}
        onAction={play}
        onDone={done}
        onRestart={() => {
          setGame(newGame())
          setTurn(null)
          setStep(0)
          setFeedback('')
          setOpen(true)
        }}
        onQuit={props.onExit}
      />
      {!turn && !game.winner && (
        <aside className={`coach${open ? '' : ' min'}`} aria-live="polite">
          {open ? (
            <>
              {feedback && <p className="fb">{feedback}</p>}
              {free ? (
                <>
                  <b>You're on your own now</b>
                  <p>The AI plays for real from here. Remember: Strike beats Charge, Charge beats Block, Block beats Strike.</p>
                  <ComboLine pattern={pattern} text={props.comboText} />
                </>
              ) : (
                <>
                  <small>
                    Tutorial {step + 1} / {TUTORIAL.length}
                  </small>
                  <b>{cur.title}</b>
                  <p>{cur.text}</p>
                  {step === TUTORIAL.length - 1 && <ComboLine pattern={pattern} text={props.comboText} />}
                  {want && <p className="try">Try: {want.charAt(0).toUpperCase() + want.slice(1)}</p>}
                </>
              )}
              <div className="row">
                <button type="button" onClick={() => setOpen(false)}>
                  Got it
                </button>
                {!free && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      markTutorialDone()
                      setStep(TUTORIAL.length)
                      setFeedback('')
                    }}
                  >
                    Skip tutorial
                  </button>
                )}
              </div>
            </>
          ) : (
            <button type="button" className="hint" onClick={() => setOpen(true)} aria-label="Show tutorial tip">
              ? {free ? 'Tips' : `Tip ${step + 1}/${TUTORIAL.length}`}
            </button>
          )}
        </aside>
      )}
    </div>
  )
}

export function ComboLine({ pattern, text }: { pattern: string[]; text: string }) {
  if (!pattern.length) return null
  return (
    <p className="combo-line">
      <span className="pks">
        {pattern.map((t, i) => (
          <i key={i} className={`t-${t}`}>
            {t}
          </i>
        ))}
      </span>
      {text}
    </p>
  )
}
