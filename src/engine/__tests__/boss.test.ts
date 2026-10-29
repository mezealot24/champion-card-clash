// Arcade final boss (engine/boss.ts): every class at once (Styles, capstones, cards, resource bars).
import { describe, expect, it } from 'vitest'
import { bossSetup, capstonesOf, costNow, createGame, pickCards, resolveTurn } from '../index'
import type { BossClass, CardDef, CardInst, GameState } from '../index'

let uid = 0
const hit = (dmg: number): CardInst => ({ uid: `h${uid++}`, def: { id: 'XX-000', type: 'P', dmg, effectText: '' } })
const pool = (c: string): CardDef[] => [
  ...Array.from({ length: 12 }, (_, i): CardDef => ({ id: `${c}-${i}`, type: 'P', dmg: 1, effectText: '' })),
  { id: `${c}-S`, type: 'S', dmg: 5, effectText: '' },
  { id: `${c}-F`, type: 'S', dmg: 5, effectText: '', styleOnly: `${c}:9` },
]
const KIT: BossClass[] = [
  { champ: 'BR', style: 'BR:1', capstone: capstonesOf('BR:1')[0] },
  { champ: 'TK', style: 'TK:1', capstone: capstonesOf('TK:1')[0] },
  { champ: 'AS', style: 'AS:1' },
  { champ: 'MG', style: 'MG:1' },
]
const POOLS = Object.fromEntries(['TK', 'BR', 'AS', 'MG'].map((c) => [c, pool(c)]))

function game(): GameState {
  return createGame({ championId: 'XX', hpStart: 100, hpMax: 100, deck: pool('XX') }, bossSetup('Chimera', 240, KIT, POOLS, 10, () => 0.5), { seed: 1 })
}

describe('Arcade boss', () => {
  it('looks like its first class and starts at the boss HP', () => {
    const b = game().players.p2
    expect(b.championId).toBe('BR')
    expect(b.style).toBe('BR:1')
    expect(b.hp).toBe(240)
    expect(b.boss?.classes).toEqual(['BR', 'TK', 'AS', 'MG'])
  })

  it('a deck of 10 cards per class, only cards its Style plays', () => {
    const b = game().players.p2
    const all = [...b.hand, ...b.deck] // Sonic Bliz starts with cards on the Field
    expect(all).toHaveLength(40)
    for (const c of ['TK', 'BR', 'AS', 'MG']) expect(all.filter((x) => x.def.id.startsWith(`${c}-`))).toHaveLength(10)
    expect(all.some((x) => x.def.id.endsWith('-F'))).toBe(false)
    expect(pickCards(pool('MG'), 'MG:9', 99).some((d) => d.id === 'MG-F')).toBe(true)
  })

  it('a capstone per class and every class bar', () => {
    const b = game().players.p2
    expect(b.perks).toEqual(KIT.filter((k) => k.capstone).map((k) => `asc:${k.style}:${k.capstone}`))
    expect(Object.keys(b.boss!.res).sort()).toEqual(['AS', 'BR', 'MG', 'TK'])
  })

  it('pays each card with its own class: Tank with HP, Mage with Mana', () => {
    const g = game()
    const b = g.players.p2
    const tk: CardInst = { uid: 'tk-s', def: POOLS.TK.find((d) => d.id === 'TK-S')! }
    const mg: CardInst = { uid: 'mg-s', def: POOLS.MG.find((d) => d.id === 'MG-S')! }
    b.hand = [tk, mg]
    b.boss!.res.MG = 5
    const hp = b.hp
    const s = resolveTurn(g, { p1: 'charge', p2: 'strike' })
    const after = s.players.p2
    expect(after.hp).toBe(hp - costNow(g, 'p2', tk))
    expect(after.boss!.res.MG).toBeLessThan(5)
    expect(after.championId).toBe('BR') // back to its own shadow after each class played
  })

  it('its classes work together: an Assassin Energy Surge guards the Bruiser-looking boss', () => {
    const g = game()
    g.players.p1.hand = [hit(40)]
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.log.some((l) => l.includes('p2 Energy Surge'))).toBe(true)
    expect(s.players.p2.hp).toBe(220) // Shroud: half dmg
  })

  it('a K.O. ends the match as usual', () => {
    const g = game()
    g.players.p1.hand = [hit(50)]
    g.players.p2.hp = 10
    const s = resolveTurn(g, { p1: 'strike', p2: 'charge' })
    expect(s.winner).toBe('p1')
  })
})
