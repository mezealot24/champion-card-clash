// Build overview stats (Q 2026-10-29): 0-10 HP / Defend / ATK / Technique / Speed from cards + loadout.
import { describe, expect, it } from 'vitest'
import { buildStats, cardPoints, OVERRIDES, pieceTags, rawStats, statTotal } from '../deckStats'
import type { EffectSpec } from '../effects/spec'
import { OATHS, TREES } from '../loadoutData'
import { PRESETS } from '../../pages/deck/presets'
import { treePoints, validAsc } from '../loadout'

const card = (dmg: number, effect_json: EffectSpec | null = null, copies = 1) => ({ dmg, copies, effect_json })
const plain = (n: number, dmg = 10) => Array.from({ length: n }, () => card(dmg))

describe('cardPoints', () => {
  it('heal → HP, Shield → Defend, +dmg → ATK, draw → Speed', () => {
    expect(cardPoints([{ hook: 'onResolve', do: [{ a: 'heal', who: 'self', n: 6 }] }]).hp).toBe(1)
    expect(cardPoints([{ hook: 'onResolve', do: [{ a: 'status', who: 'self', kind: 'shield', turns: 1, n: 10 }] }]).def).toBe(1)
    expect(cardPoints([{ hook: 'modify', do: [{ a: 'addDmg', target: 'this', n: 6 }] }]).atk).toBe(1)
    expect(cardPoints([{ hook: 'onResolve', do: [{ a: 'draw', who: 'self', n: 2 }] }]).spd).toBe(2)
  })

  it('a −dmg on the enemy chain is Defend, not ATK', () => {
    const p = cardPoints([{ hook: 'modify', do: [{ a: 'addDmg', target: 'facing', n: -10 }] }])
    expect(p).toMatchObject({ def: 1, atk: 0 })
  })

  it('a payoff behind real setup adds Technique; "if you Strike" alone does not', () => {
    const easy = cardPoints([{ hook: 'modify', if: [{ c: 'selfAction', a: 'strike' }], do: [{ a: 'mulDmg', target: 'this', pct: 300 }] }])
    const slot3 = cardPoints([{ hook: 'modify', if: [{ c: 'slotIs', n: 3 }], do: [{ a: 'mulDmg', target: 'this', pct: 300 }] }])
    expect(easy.tech).toBe(0)
    expect(slot3.tech).toBeGreaterThan(0)
    expect(slot3.atk).toBe(easy.atk)
  })

  it('Cut, steal and locks are Technique', () => {
    expect(cardPoints([{ hook: 'onResolve', do: [{ a: 'cut', which: 'oldest', n: 1 }] }]).tech).toBe(1)
    expect(cardPoints([{ hook: 'onResolve', do: [{ a: 'status', who: 'enemy', kind: 'noBlock', turns: 1 }] }]).tech).toBe(1)
  })

  it('no effect = no points', () => {
    expect(statTotal(cardPoints(null))).toBe(0)
  })
})

describe('buildStats', () => {
  it('more Max HP and more heals = more HP', () => {
    const heal = card(10, [{ hook: 'onResolve', do: [{ a: 'heal', who: 'self', n: 6 }] }])
    const low = buildStats({ champ: 'MG', hpMax: 145, cards: plain(25) })
    const high = buildStats({ champ: 'TK', hpMax: 300, cards: [...plain(15), ...Array.from({ length: 10 }, () => heal)] })
    expect(high.hp).toBeGreaterThan(low.hp)
  })

  it('bigger cards = more ATK', () => {
    expect(buildStats({ champ: 'BR', hpMax: 230, cards: plain(25, 20) }).atk).toBeGreaterThan(buildStats({ champ: 'BR', hpMax: 230, cards: plain(25, 8) }).atk)
  })

  it('stays within 0-10', () => {
    const draw = card(40, [{ hook: 'onDraw', do: [{ a: 'draw', who: 'self', n: 3 }, { a: 'heal', who: 'self', n: 9 }] }], 25)
    const s = buildStats({ champ: 'TK', hpMax: 900, cards: [draw] })
    expect(Object.values(s).every((v) => v >= 0 && v <= 10)).toBe(true)
    expect(s.spd).toBe(10)
  })

  it('Oath and Ascendancy nodes count; a capstone adds Technique', () => {
    const base = rawStats({ champ: 'AS', hpMax: 175, cards: plain(25), style: 'AS:1' })
    const quick = rawStats({ champ: 'AS', hpMax: 175, cards: plain(25), style: 'AS:1', oath: 'o2' })
    expect(quick.spd).toBeGreaterThan(base.spd)
    const cap = rawStats({ champ: 'AS', hpMax: 175, cards: plain(25), style: 'AS:1', asc: ['A1', 'A2', 'A3'] })
    expect(cap.tech).toBeGreaterThan(base.tech)
  })

  it('every Oath and node is tagged to some stat (or knowingly left out)', () => {
    const untagged = [
      ...Object.entries(OATHS).flatMap(([c, os]) => os.map((o) => [`${c}:${o.id}`, o.text])),
      ...Object.entries(TREES).flatMap(([st, t]) => t.nodes.map((n) => [`${st}:${n.id}`, `${n.text} ${n.name}`])),
    ]
      .filter(([key, text]) => !OVERRIDES[key] && Object.keys(pieceTags(text)).length === 0)
      .map(([key]) => key)
    expect(untagged).toEqual([])
  })
})

describe('presets', () => {
  const all = Object.entries(PRESETS).flatMap(([champ, ps]) => ps.map((p) => ({ champ, p })))

  it('ids are unique per Champion and at most 2 copies per card', () => {
    for (const ps of Object.values(PRESETS)) expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length)
    for (const { p } of all) expect(Object.values(p.deck).every((n) => Number.isInteger(n) && n >= 1 && n <= 2)).toBe(true)
  })

  it('Style, Oath and a full legal tree', () => {
    for (const { champ, p } of all) {
      expect(p.style.startsWith(`${champ}:`)).toBe(true)
      expect(OATHS[champ].some((o) => o.id === p.oath)).toBe(true)
      const pts = treePoints(p.style, 5)
      expect(validAsc(p.asc, pts, p.style) && p.asc.length === pts).toBe(true)
    }
  })

  it('hand-set stats are whole numbers 0-10', () => {
    for (const { p } of all) if (p.stats) expect(Object.values(p.stats).every((v) => Number.isInteger(v) && v >= 0 && v <= 10)).toBe(true)
  })
})
