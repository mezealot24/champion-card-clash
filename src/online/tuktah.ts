// "vs ตุ๊กตา": the opponent's pick comes from Claude through the Artifact `sample` capability, one call per turn.
// The page asks before the player's pick is sent anywhere, so Claude never sees it.
import { legalActions, resourceOf, STYLES, tuningOf, type Action, type GameState, type PlayerState, type Side } from '../engine'
import type { Sample } from './claude'

export type TuktahMove = { action: Action; line: string }

const RULES = `Champion Card Clash rules (short):
- Each turn both sides secretly pick Strike, Block or Charge, then reveal. Strike beats Charge, Charge beats Block, Block beats Strike.
- Field = face-up cards, max 5, oldest first. Charge draws 1 card. Strike plays EVERY Field card as a chain in slot order, then the Field is empty.
- Strike vs Block: Block stops the first 2 hits, the rest land; striker's Field is emptied, blocker keeps theirs.
- Strike vs Strike: both chains hit fully, both Fields empty.
- Strike vs Charge: the striker hits fully and the charger suffers a charge break (oldest card lost, the rest shift up, 1 new card drawn at the end).
- Charge vs Block: charger draws for free. Charge vs Charge: both draw. Block vs Block 3 times in a row: both Fields are discarded.
- Charging with a full Field (5) draws nothing. Card effects and Styles below can change all of this.`

function side(game: GameState, p: PlayerState, label: string, styleText: Record<string, string>) {
  const res = resourceOf(p.championId, game.tuning)
  const field = p.hand.map((c, i) => `  slot ${i + 1}: ${c.def.id} ${c.def.type} ${c.def.dmg} dmg${c.grow ? ` (+${c.grow})` : ''}${c.def.effectText ? ` | ${c.def.effectText}` : ''}`)
  return [
    `${label}: ${p.championId}${p.style ? ` · Style ${STYLES[p.style]?.name ?? p.style}: ${styleText[p.style] ?? ''}` : ''}`,
    `  HP ${p.hp}/${p.maxHp}${res && !res.payWithHp ? ` · ${res.name} ${p.res ?? 0}/${res.cap}` : ''}${p.statuses.length ? ` · statuses: ${p.statuses.map((s) => `${s.kind}${s.n != null ? ` ${s.n}` : ''} (${s.turns}t)`).join(', ')}` : ''}${p.comboData?.conqueror ? ` · Momentum ${p.comboData.conqueror}/${tuningOf(game)['BR:2'].conquerorMax}` : ''}`,
    `  Field (${p.hand.length}/5):`,
    ...(field.length ? field : ['  (empty)']),
  ].join('\n')
}

export function tuktahPrompt(game: GameState, me: Side, history: { mine: Action; theirs: Action }[], styleText: Record<string, string> = {}): string {
  const foe = me === 'p1' ? 'p2' : 'p1'
  const legal = legalActions(game, me)
  const past = history.slice(-10).map((h, i) => `  ${i + 1}. you ${h.mine} / Q ${h.theirs}`).join('\n')
  return `You are ตุ๊กตา (Tuktah), a playful Thai woman and senior game designer, playing a card battle against Q, the game's designer. Play to win, read Q's habits, and keep it fun.

${RULES}

Turn ${game.turn + 1}. Block-vs-Block streak: ${game.blockStreak}.
${side(game, game.players[me], 'YOU (Tuktah)', styleText)}
${side(game, game.players[foe], 'Q (opponent)', styleText)}

Recent turns (oldest first):
${past || '  (none yet)'}

Your legal actions now: ${legal.join(', ')}.
Pick one. Reply with JSON only: {"action": "strike" | "block" | "charge", "line": "<one short playful Thai trash-talk line in a female voice (ending with ค่ะ/คะ/นะคะ, calling yourself หนู), max 60 characters, must NOT reveal or hint at your pick>"}`
}

/** Why a turn had no pick from Tuktah (a SampleError code, or 'illegal' / 'unreadable' for an answer we couldn't use). */
export type TuktahMiss = { miss: string; line?: string }

const pickFrom = (raw: unknown): { action?: string; line?: string } | null => {
  if (raw && typeof raw === 'object') return raw as { action?: string; line?: string }
  const m = String(raw ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

/**
 * One pick from Claude. Uses the quick tier: the default tier thinks for 5-60 s before it answers, which read as
 * "Tuktah dropped out" mid-match. A reply that isn't clean JSON gets one plain-text retry (never a loop); an illegal
 * pick keeps Tuktah's line and lets the page fall back to the AI's pick.
 */
export async function askTuktah(sample: Sample, game: GameState, me: Side, history: { mine: Action; theirs: Action }[], styleText: Record<string, string> = {}): Promise<TuktahMove | TuktahMiss> {
  const prompt = tuktahPrompt(game, me, history, styleText)
  let out: { action?: string; line?: string } | null = null
  try {
    out = pickFrom(await sample.json(prompt, { modelTier: 'quick', cache: false }))
  } catch (e) {
    const code = (e as { code?: string })?.code ?? 'upstream_error'
    if (!['invalid_json', 'empty_completion', 'upstream_error'].includes(code) || typeof sample !== 'function') return { miss: code }
    try {
      out = pickFrom((await sample(prompt, { modelTier: 'quick', cache: false })).text)
    } catch (e2) {
      return { miss: (e2 as { code?: string })?.code ?? 'upstream_error' }
    }
  }
  if (!out) return { miss: 'unreadable' }
  const action = String(out.action ?? '').toLowerCase() as Action
  const line = String(out.line ?? '').slice(0, 80)
  if (!legalActions(game, me).includes(action)) return { miss: 'illegal', line }
  return { action, line }
}
