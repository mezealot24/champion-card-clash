// Player-facing words for the Champion select screen and the tutorial: who each Champion is, a one-line Style summary,
// and how the signature combo fires. {placeholders} are filled from the tuning (Admin), like Style text (engine/tuning.ts fillText):
// {key} = a number of the Style's own group, {TK.key} = any group.
import { COMBOS } from '../../engine/combos'
import type { CardType } from '../../engine'

export type ChampInfo = {
  role: string
  /** 2–3 short lines: how it plays */
  plays: string[]
  /** resource line, placeholders from the champion group */
  resource: string
  /** what the signature combo does (pattern chips come from engine COMBOS) */
  combo: string
}

export const CHAMP_INFO: Record<string, ChampInfo> = {
  TK: {
    role: 'Wall. Huge HP, outlasts everyone.',
    plays: ['Block a lot and keep your Field.', 'Heals keep you in the fight.', 'S cards cost HP instead of a resource.'],
    resource: 'S cards cost {TK.sCost} HP',
    combo: 'Two P and one K in one chain. If the enemy Blocks one of them, heal {TK.comboHealPct}% of your HP.',
  },
  BR: {
    role: 'Brawler. Trades hits and hits back harder.',
    plays: ['Taking and dealing hits builds Rage.', 'S cards need Rage, or they hit for half.', 'Big cards cost your own HP.'],
    resource: 'Rage, max {BR.cap}. S cards cost {BR.sCost}',
    combo: 'One S and two P in one chain: Guard Crush. Your next Strike goes through Block.',
  },
  AS: {
    role: 'Glass cannon. Fast chains, low HP.',
    plays: ['Strike often with long chains.', 'Energy refills every turn.', "Don't get caught Charging."],
    resource: 'Energy, max {AS.cap}, +{AS.perTurn} per turn',
    combo: 'P, K and S all hit clean: Mark of Assassin. Every later Strike bursts +{AS.markBurstPct}%.',
  },
  MG: {
    role: 'Spellcaster. Lowest HP, strongest S cards.',
    plays: ['Charge and Block build Mana.', 'Spend Mana on S cards.', 'Clean P/K hits give Mana too.'],
    resource: 'Mana, max {MG.cap}. +{MG.perChargeBlock} per Charge or Block',
    combo: "Three S cards all hit clean: the enemy can't Block next turn.",
  },
}

/** One line per Style: what it does in plain words. Full rules stay in the Style's effect text. */
export const STYLE_SUMMARY: Record<string, string> = {
  'TK:1': 'Below {hpPct}% HP, every clean hit you take heals you.',
  'TK:2': 'Hits you take grow your Max HP. More Max HP = more damage.',
  'BR:1': 'Warm-up at {warmUpRage}+ Rage: first {slots} chain cards deal +{warmUpDmg}. Below {hpPct}% HP, True Fury gives +{bonusDmg}; stopped hits chip {chipDmg} and give +{chipRage} Rage.',
  'BR:2': 'Each chain card adds a stack (+{dmgPerStack} dmg). Full stacks: lifesteal.',
  'AS:1': 'Start with {startDraw} cards. Strike vs Strike refills Energy and draws {dualDraw}.',
  'AS:2': 'Every {every|ord} attack is a x{critMult} Critical.',
  'MG:1': 'Each paid S card ⟡ Infuses {MG.infusePerS} Ignite, even if Blocked. Ignite burns and cuts healing.',
  'MG:2': 'Start with Shield {frostArmorShield}. Each paid S card ⟡ Infuses {MG.infusePerS} Chill; {chillMax} Chill = Frozen.',
}

/** The signature combo's card types, e.g. ['P','K','P']. */
export const comboPattern = (champ: string): CardType[] => COMBOS[champ]?.[0]?.pattern ?? []
