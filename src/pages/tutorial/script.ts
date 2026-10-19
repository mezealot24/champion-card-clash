// First-match tutorial script. Each step says what to try, which action we hope for, and what the
// scripted opponent does that turn. After the last step the real AI takes over (free play).
import type { Action } from '../../engine'

export type TutStep = {
  title: string
  text: string
  /** the action the coach points at */
  want: Action
  /** what the opponent plays this turn ('ai' = the normal AI) */
  foe: Action | 'ai'
  /** shown after the turn if the player did what was asked */
  good: string
}

export const TUTORIAL: TutStep[] = [
  {
    title: 'Charge to draw',
    text: 'Your Field is empty, so you have nothing to Strike with. Charge draws a card onto your Field.',
    want: 'charge',
    foe: 'block',
    good: 'Charge beats Block. You drew a card and their Block did nothing.',
  },
  {
    title: 'Fill your Field',
    text: 'Both sides pick at the same time, then reveal. Charge again to get more cards.',
    want: 'charge',
    foe: 'charge',
    good: 'Both Charged, so both drew. Cards on the Field are open: you can read every card.',
  },
  {
    title: 'Strike!',
    text: 'The AI keeps Charging while its Field is small. Strike beats Charge: all your Field cards hit, in order.',
    want: 'strike',
    foe: 'charge',
    good: 'Strike beats Charge. Your whole Field hit as a chain, and their Charge broke (they lost a card).',
  },
  {
    title: 'Block',
    text: 'Now the AI has cards and wants to hit you. Block stops the first 2 hits, and you keep your Field.',
    want: 'block',
    foe: 'strike',
    good: 'Block beats Strike. Their first 2 hits were stopped.',
  },
  {
    title: 'Your combo',
    text: 'Every Champion has a signature combo: the right card types in one chain. Charge to build it.',
    want: 'charge',
    foe: 'block',
    good: 'Your Field is growing. Tap any card to read it in full.',
  },
]

/** The tutorial opponent: Mage (lowest HP, so the match stays short), or Bruiser when you play Mage. No Styles on either side. */
export const tutorialFoe = (me: string) => (me === 'MG' ? 'BR' : 'MG')

export const BEATS: Record<Action, Action> = { strike: 'charge', charge: 'block', block: 'strike' }
const NAME: Record<Action, string> = { strike: 'Strike', charge: 'Charge', block: 'Block' }

/** One line on who won the action triangle this turn. */
export function outcomeLine(mine: Action, theirs: Action): string {
  if (mine === theirs) return `Both picked ${NAME[mine]}.`
  if (BEATS[mine] === theirs) return `${NAME[mine]} beats ${NAME[theirs]}. You won that turn.`
  return `${NAME[theirs]} beats ${NAME[mine]}. They won that turn.`
}
