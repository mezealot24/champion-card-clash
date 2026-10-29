// Arcade final boss (Q 2026-10-29: "a mash-up of every Champion, like Seth in Street Fighter 4").
// Chimera looks like the black shadow of one Champion but plays every class at once:
// - one Style per class, all on (Tank Lifeline + Bruiser Fury + ...);
// - one Ascendancy capstone per class, from that Style's tree (Cost included);
// - a deck of cardsPerClass cards from each class's pool, matching its Style (Pyromancer → fire cards);
// - every class's resource bar; each card is paid and played as its class (engine/classes.ts).
import { inStyleDeck, type ChampionSetup } from './state'
import type { CardDef } from './types'

/** One class of the boss: its Champion, Style and capstone (Ascendancy node id, if the Style has a tree). */
export type BossClass = { champ: string; style: string; capstone?: string }

/**
 * The boss as a createGame seat. classes[0] is the Champion it looks like.
 * pools = each class's full deck (buildDeck rows); the boss takes `perClass` cards of each at random.
 */
export function bossSetup(
  name: string,
  hp: number,
  classes: BossClass[],
  pools: Record<string, CardDef[]>,
  perClass: number,
  rand: () => number = Math.random,
): ChampionSetup {
  const deck = classes.flatMap((c) => pickCards(pools[c.champ] ?? [], c.style, perClass, rand))
  return {
    championId: classes[0].champ,
    hpStart: hp,
    hpMax: hp,
    deck,
    style: classes[0].style,
    boss: {
      name,
      classes: classes.map((c) => c.champ),
      styles: Object.fromEntries(classes.map((c) => [c.champ, c.style])),
      perks: classes.flatMap((c) => (c.capstone ? [`asc:${c.style}:${c.capstone}`] : [])),
    },
  }
}

/** n cards at random from a class's pool, only ones its Style plays (copies count as separate cards). */
export function pickCards(pool: CardDef[], style: string, n: number, rand: () => number = Math.random): CardDef[] {
  const a = pool.filter((d) => inStyleDeck(d, style))
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}
