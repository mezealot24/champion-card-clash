// Loadout content (design/customization-options-2026-10-18.md): Sigil I · Oath (per Champion, Boon + Cost),
// Sigil II · Minor (shared, small, no cost) and the Ascendancy tree of each Style (2 branches × 4 nodes, top-down; Mage: 4 branches × 3).
// Names and numbers started as the Game Designer mockup's placeholders; nodes the engine can't do cheaply were swapped
// for ones it can. Every number is a tuning field (Admin): Oaths in the Champion's class group, nodes in their Style's
// group, Minors in game_config (minor_* keys). Text says {key} for its own group's numbers, like Style text.
// No imports: tuning.ts reads the fields from here, loadout.ts adds the behaviour.

export type LoadoutField = { key: string; label: string; def: number; min?: number; max?: number }
export type PieceData = {
  id: string
  name: string
  /** what you get */
  text: string
  /** what you pay (Oaths) */
  cost?: string
  fields: LoadoutField[]
}

const f = (key: string, label: string, def: number, min = 0, max?: number): LoadoutField => ({ key, label, def, min, ...(max !== undefined ? { max } : {}) })

/** Sigil I · Oath, by Champion. Numbers live in the Champion's class group (champions.params). */
export const OATHS: Record<string, PieceData[]> = {
  TK: [
    { id: 'o1', name: 'Bulwark Oath', text: 'Your first Block of the match stops every hit.', cost: 'Your S cards cost {bulwarkCostPct}% more HP.', fields: [f('bulwarkCostPct', 'Oath Bulwark: S cost +%', 50)] },
    { id: 'o2', name: 'Deep Roots', text: '+{deepRootsHp} Max HP and start HP.', cost: 'Your Field holds {deepRootsField} cards.', fields: [f('deepRootsHp', 'Oath Deep Roots: Max HP +', 40), f('deepRootsField', 'Oath Deep Roots: Field slots', 4, 1, 5)] },
    { id: 'o3', name: 'Thornhide', text: 'Each hit your Block stops deals {thornDmg} dmg back to the striker.', cost: 'Your Block stops {thornBlockLoss} hit fewer.', fields: [f('thornDmg', 'Oath Thornhide: dmg back per blocked hit', 4), f('thornBlockLoss', 'Oath Thornhide: Block stops fewer', 1)] },
  ],
  BR: [
    { id: 'o1', name: 'Bloodlust', text: 'Lifesteal {bloodlustPct}% while your HP is below {bloodlustHpPct}%.', cost: 'Your Field holds {bloodlustField} cards.', fields: [f('bloodlustPct', 'Oath Bloodlust: Lifesteal %', 25, 0, 100), f('bloodlustHpPct', 'Oath Bloodlust: HP line %', 30, 1, 100), f('bloodlustField', 'Oath Bloodlust: Field slots', 4, 1, 5)] },
    { id: 'o2', name: 'Hot Blood', text: 'Start the match with {hotBloodRage} Rage.', cost: '−{hotBloodHp} Max HP.', fields: [f('hotBloodRage', 'Oath Hot Blood: Rage at start +', 10), f('hotBloodHp', 'Oath Hot Blood: Max HP −', 20)] },
    { id: 'o3', name: 'Iron Hide', text: 'Every hit that reaches you deals {ironHideCut} less dmg.', cost: 'You gain {ironHideRage} less Rage per hit taken.', fields: [f('ironHideCut', 'Oath Iron Hide: dmg cut per hit', 2), f('ironHideRage', 'Oath Iron Hide: Rage per hit taken −', 1)] },
  ],
  AS: [
    { id: 'o1', name: 'Shadow Edge', text: 'Chain slot 1 deals +{shadowEdgeDmg} dmg.', cost: '−{shadowEdgeHp} Max HP.', fields: [f('shadowEdgeDmg', 'Oath Shadow Edge: slot 1 dmg +', 6), f('shadowEdgeHp', 'Oath Shadow Edge: Max HP −', 20)] },
    { id: 'o2', name: 'Quickdraw', text: 'Start the match with {quickdrawCards} more cards on your Field.', cost: 'Energy cap −{quickdrawCap}.', fields: [f('quickdrawCards', 'Oath Quickdraw: cards at start +', 2, 0, 5), f('quickdrawCap', 'Oath Quickdraw: Energy cap −', 1)] },
    { id: 'o3', name: 'Vanish', text: 'Start the match with Parry {vanishParry}: the first hits that get past your Block deal 0.', cost: 'Start the match with {vanishEnergy} Energy.', fields: [f('vanishParry', 'Oath Vanish: Parry at start', 2), f('vanishEnergy', 'Oath Vanish: Energy at start', 0)] },
  ],
  MG: [
    { id: 'o1', name: 'Overcharge', text: 'Mana cap +{overchargeCap}.', cost: 'Your Block stops {overchargeBlockLoss} hit fewer.', fields: [f('overchargeCap', 'Oath Overcharge: Mana cap +', 2), f('overchargeBlockLoss', 'Oath Overcharge: Block stops fewer', 1)] },
    { id: 'o2', name: 'Arcane Ward', text: 'Start the match with Shield {arcaneWardShield}.', cost: 'Your S cards cost {arcaneWardCost} more Mana.', fields: [f('arcaneWardShield', 'Oath Arcane Ward: Shield at start', 20), f('arcaneWardCost', 'Oath Arcane Ward: S cost +', 1)] },
    { id: 'o3', name: 'Glass Focus', text: 'All your cards deal +{glassFocusDmg} dmg.', cost: '−{glassFocusHp} Max HP.', fields: [f('glassFocusDmg', 'Oath Glass Focus: all cards dmg +', 3), f('glassFocusHp', 'Oath Glass Focus: Max HP −', 20)] },
  ],
}

/** Sigil II · Minor, shared by every Champion. Numbers in game_config as minor_<snake_key>. */
export const MINORS: PieceData[] = [
  { id: 'm1', name: 'Second Breath', text: '+{secondBreathHp} Max HP and start HP.', fields: [f('secondBreathHp', 'Minor Second Breath: Max HP +', 10)] },
  { id: 'm2', name: 'Head Start', text: 'Start with +{headStartRes} resource (Tank: +{headStartTankHp} Max HP instead).', fields: [f('headStartRes', 'Minor Head Start: resource at start +', 1), f('headStartTankHp', 'Minor Head Start: Tank Max HP +', 10)] },
  { id: 'm3', name: 'Steady Hands', text: 'Your first Charge of the match draws {steadyDraw} more.', fields: [f('steadyDraw', 'Minor Steady Hands: extra draw', 1)] },
  { id: 'm4', name: 'Last Stand', text: 'While your HP is below {lastStandHpPct}%, chain slot 1 deals +{lastStandDmg} dmg.', fields: [f('lastStandHpPct', 'Minor Last Stand: HP line %', 30, 1, 100), f('lastStandDmg', 'Minor Last Stand: slot 1 dmg +', 5)] },
]

/**
 * branches: one name per branch, ids A.., B.., C.., D.. in order. depth: nodes per branch (default 4), the last is the capstone.
 * bonusPoints: points this tree gets on top of game_config asc_points (Mage v2: +1, Q 2026-10-25).
 */
export type TreeData = { branches: string[]; nodes: PieceData[]; depth?: number; bonusPoints?: number }

const node = (id: string, name: string, text: string, key: string, label: string, def: number, min = 0, max?: number): PieceData => ({
  id,
  name,
  text,
  fields: [f(key, `Asc ${id} ${name}: ${label}`, def, min, max)],
})

/** Capstone (Mage v2): a node with a Cost line; its first field is {key}, the rest are named in text/cost. */
const capstone = (id: string, name: string, text: string, cost: string, fields: [string, string, number, number?, number?][]): PieceData => ({
  id,
  name,
  text,
  cost,
  fields: fields.map(([key, label, def, min, max]) => f(key, `Asc ${id} ${name}: ${label}`, def, min ?? 0, max)),
})

/**
 * Ascendancy tree per Style. Node ids A1..A4 / B1..B4 (Mage: A1..D3); take them top-down in a branch, the last node = capstone.
 * Numbers live in the Style's group (champion_styles.params) as asc<ID> (Mage v2: named asc keys).
 */
export const TREES: Record<string, TreeData> = {
  'TK:1': {
    branches: ['Rally', 'Iron Will'],
    nodes: [
      node('A1', 'Early Rally', 'Lifeline HP line +{ascA1}%.', 'ascA1', 'HP line % +', 5),
      node('A2', 'Deep Breaths', 'Lifeline heals +{ascA2}% of missing HP per hit.', 'ascA2', 'heal % +', 1),
      node('A3', 'Steady Guard', 'P+K+P combo heal +{ascA3}%.', 'ascA3', 'combo heal % +', 5),
      node('A4', 'Last Bastion', 'The first time your HP drops into the red, gain Shield {ascA4}.', 'ascA4', 'Shield', 30),
      node('B1', 'Thick Skin', '+{ascB1} Max HP and start HP.', 'ascB1', 'Max HP +', 15),
      node('B2', 'Hold the Line', 'While your HP is red, your Block stops {ascB2} more hit.', 'ascB2', 'Block stops +', 1),
      node('B3', 'Grit', 'Your S cards cost {ascB3} less HP.', 'ascB3', 'S cost −', 3),
      node('B4', 'Unbroken', 'Once per match, a hit that would knock you out leaves you at 1 HP.', 'ascB4', 'times per match', 1),
    ],
  },
  'TK:2': {
    branches: ['Bloom', 'Bramble'],
    nodes: [
      node('A1', 'Taproot', 'Titan Bloom: +{ascA1} Max HP per facing pair.', 'ascA1', 'per facing +', 1),
      node('A2', 'Seedling', 'Start the match with {ascA2} Max HP already grown.', 'ascA2', 'Max HP grown at start', 20),
      node('A3', 'Heartwood', 'Titan Bloom needs {ascA3} less Max HP grown for each +1 dmg.', 'ascA3', 'HP per dmg −', 5),
      node('A4', 'Deep Growth', 'Titan Bloom: +{ascA4} Max HP per hit taken.', 'ascA4', 'per hit taken +', 1),
      node('B1', 'Bark Guard', 'Titan Bloom: +{ascB1} Max HP per hit Blocked.', 'ascB1', 'per hit Blocked +', 1),
      node('B2', 'Sap', 'Heal {ascB2} each turn your Block stops a hit.', 'ascB2', 'heal', 3),
      node('B3', 'Wide Canopy', 'Titan Bloom Max HP cap +{ascB3}.', 'ascB3', 'cap +', 50),
      node('B4', 'World Tree', 'Heal {ascB4} at the end of every turn you Block.', 'ascB4', 'heal', 4),
    ],
  },
  'BR:1': {
    branches: ['Frenzy', 'Blood Rush'],
    nodes: [
      node('A1', 'Short Fuse', 'Fury HP line +{ascA1}%.', 'ascA1', 'HP line % +', 5),
      node('A2', 'Heavy Hands', 'Fury bonus +{ascA2} dmg.', 'ascA2', 'bonus dmg +', 2),
      node('A3', 'Wide Swing', 'Fury reaches {ascA3} more chain slot.', 'ascA3', 'slots +', 1),
      node('A4', 'Blood Frenzy', 'Below {ascA4}% HP, the Fury bonus counts twice.', 'ascA4', 'HP line %', 25, 1, 100),
      node('B1', 'Seething', '+{ascB1} Rage per clean hit.', 'ascB1', 'Rage per clean hit +', 1),
      node('B2', 'Bloodletting', 'Lifesteal {ascB2}% while Fury is on.', 'ascB2', 'Lifesteal %', 10, 0, 100),
      node('B3', 'Hardened', '+{ascB3} Max HP and start HP.', 'ascB3', 'Max HP +', 15),
      node('B4', 'Unstoppable', 'While Fury is on, chain slot 1 ignores Block.', 'ascB4', 'slots that ignore Block', 1, 0, 5),
    ],
  },
  'BR:2': {
    branches: ['Momentum', 'Ironclad'],
    nodes: [
      node('A1', 'Warm Up', 'Start the match with {ascA1} Momentum stack.', 'ascA1', 'stacks at start', 1),
      node('A2', 'Pile On', 'Conqueror max stacks +{ascA2}.', 'ascA2', 'max stacks +', 1),
      node('A3', 'Hungry Steel', 'Max-stack Lifesteal +{ascA3}%.', 'ascA3', 'Lifesteal % +', 5),
      node('A4', 'Iron Tide', 'Tenacity lasts {ascA4} more turn.', 'ascA4', 'turns +', 1),
      node('B1', 'Unshaken', 'A Block costs {ascB1} fewer Momentum stacks.', 'ascB1', 'stacks lost −', 1),
      node('B2', 'Plated', '+{ascB2} Max HP and start HP.', 'ascB2', 'Max HP +', 10),
      node('B3', 'Braced', 'At max stacks, a charge break hurts {ascB3}% less.', 'ascB3', 'extra dmg % −', 20),
      node('B4', 'Steamroller', 'At max stacks, chain slot 1 ignores Block.', 'ascB4', 'slots that ignore Block', 1, 0, 5),
    ],
  },
  'AS:1': {
    branches: ['Overdrive', 'Acceleration'],
    nodes: [
      node('A1', 'Hair Trigger', 'Overdrive needs {ascA1} fewer chain card.', 'ascA1', 'min chain −', 1),
      node('A2', 'Redline', 'Overdrive +{ascA2} dmg per Energy.', 'ascA2', 'dmg per Energy +', 1),
      node('A3', 'Killer Instinct', 'Mark of Assassin burst +{ascA3}%.', 'ascA3', 'burst % +', 10),
      node('A4', 'Afterimage', 'After an Overdrive Strike, gain Parry {ascA4} for the next turn.', 'ascA4', 'Parry', 2),
      node('B1', 'Quick Hands', 'Acceleration draws {ascB1} more.', 'ascB1', 'draw +', 1),
      node('B2', 'Quick Start', 'Start with {ascB2} more card on the Field.', 'ascB2', 'cards at start +', 1),
      node('B3', 'Overflow', 'Energy cap +{ascB3}.', 'ascB3', 'Energy cap +', 1),
      node('B4', 'Blur', 'After Strike meets Strike, your next Block stops {ascB4} more hits.', 'ascB4', 'Block stops +', 2),
    ],
  },
  'AS:2': {
    branches: ['Execution', 'Shadow'],
    nodes: [
      node('A1', 'Primed', 'The Critical counter starts at {ascA1}.', 'ascA1', 'counter at start', 1),
      node('A2', 'Blood Scent', 'Low HP line +{ascA2}%.', 'ascA2', 'HP line % +', 5),
      node('A3', 'Merciless', 'Critical vs low HP ×{ascA3} more.', 'ascA3', 'multiplier +', 1),
      node('A4', 'Final Verdict', 'Blocked Criticals deal +{ascA4}% dmg.', 'ascA4', 'blocked dmg % +', 50),
      node('B1', 'Feint', 'Blocked Criticals deal +{ascB1}% dmg.', 'ascB1', 'blocked dmg % +', 25),
      node('B2', 'Siphon', 'Each Critical heals {ascB2}.', 'ascB2', 'heal', 5),
      node('B3', 'Nimble', '+{ascB3} Max HP and start HP.', 'ascB3', 'Max HP +', 10),
      node('B4', 'Shadow Mark', 'After a Strike with a Critical, your next chain deals +{ascB4} dmg per card.', 'ascB4', 'dmg +', 5),
    ],
  },
  /**
   * Mage v2 (Q 2026-10-21/25, design/mage-ascendancy-v2-2026-10-21.md): 4 branches, each a different way to play.
   * Node 1-2 + an optional capstone that changes a rule and has a Cost. 6 points (asc_points + 1).
   * Keys are named (not asc<ID>) so numbers tuned for the old v1 nodes don't carry over.
   */
  'MG:1': {
    branches: ['Inferno', 'Wildfire', 'Molten Core', 'Phoenix'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      node('A1', 'Flashpoint', 'Your cards deal +{ascFlashpoint} dmg for each Ignite stack on the enemy.', 'ascFlashpoint', 'dmg per enemy Ignite', 1),
      node('A2', 'Stockpile', 'Ignite max stacks +{ascStockpile}.', 'ascStockpile', 'max stacks +', 2),
      capstone('A3', 'Combustion', 'Your S + S + S combo consumes all enemy Ignite: they lose {ascCombustion} HP per stack.', 'Ignite burns {ascCombustionCost} less HP per stack.', [
        ['ascCombustion', 'HP per stack', 8],
        ['ascCombustionCost', 'Cost: burn per stack −', 1],
      ]),
      node('B1', 'Slow Burn', 'Ignite lasts {ascSlowBurn} more turns.', 'ascSlowBurn', 'turns +', 2),
      node('B2', 'Fan the Flames', 'Each of your hits the enemy stops gives them {ascFanFlames} Ignite.', 'ascFanFlames', 'Ignite per stopped hit', 1),
      capstone('B3', 'Everburn', 'Ignite never runs out and burns +{ascEverburn} HP per stack.', 'All your cards deal −{ascEverburnCost} dmg.', [
        ['ascEverburn', 'burn per stack +', 1],
        ['ascEverburnCost', 'Cost: card dmg −', 2],
      ]),
      node('C1', 'Backdraft', 'Each hit your Molten Shield Block stops deals {ascBackdraft} dmg back.', 'ascBackdraft', 'dmg back per hit', 3),
      node('C2', 'Banked Heat', 'When your Molten Shield Block is attacked and you take no dmg, gain {ascBankedHeat} Mana.', 'ascBankedHeat', 'Mana', 1),
      capstone('C3', 'Eruption', 'After a Molten Shield Block, your next Strike: every card +{ascEruption} dmg per Mana that Block spent.', 'Molten Shield no longer Ignites the hits it stops.', [
        ['ascEruption', 'dmg per Mana', 2],
      ]),
      node('D1', 'Ember Heart', 'While your HP is in the red (30%), each paid Skill card gives the enemy {ascEmberHeart} more Ignite.', 'ascEmberHeart', 'Ignite +', 1),
      node('D2', 'Cauterize', 'At the end of every turn, heal {ascCauterize} for each Ignite stack on the enemy.', 'ascCauterize', 'heal per stack', 1),
      capstone('D3', 'Rebirth', 'Once per match, a hit that would knock you out leaves you on 1 HP: heal {ascRebirth}% Max HP and the enemy gets max Ignite.', '−{ascRebirthCost} Max HP.', [
        ['ascRebirth', 'heal % Max HP', 30, 0, 100],
        ['ascRebirthCost', 'Cost: Max HP −', 20],
      ]),
    ],
  },
  'MG:2': {
    branches: ['Shatter', 'Permafrost', 'Glacier', 'Rime Hex'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      node('A1', 'Brittle', 'Your cards deal +{ascBrittle}% dmg for each Chill stack on the enemy.', 'ascBrittle', 'dmg % per enemy Chill', 10),
      node('A2', 'Cold Snap', 'While the enemy is Frozen, your cards deal +{ascColdSnap} dmg.', 'ascColdSnap', 'dmg +', 4),
      capstone('A3', 'Shatterpoint', 'Freeze at {ascShatterpoint} fewer Chill, and Shatter takes +{ascShatterpointPct}% Max HP.', 'Frost Armor (and Frozen Tomb) Shield −{ascShatterpointCost}.', [
        ['ascShatterpoint', 'stacks to freeze −', 1],
        ['ascShatterpointPct', 'Shatter % +', 5],
        ['ascShatterpointCost', 'Cost: Shield −', 20],
      ]),
      node('B1', 'Numbing Cold', 'Each Chill cuts +{ascNumbingCold}% more dmg.', 'ascNumbingCold', 'dmg cut % +', 5),
      node('B2', 'Bitter Wind', 'When the enemy has {ascBitterWind}+ Chill after your chain, their Skill card effects are off next turn.', 'ascBitterWind', 'Chill needed', 3, 1),
      capstone('B3', 'Eternal Winter', 'Chill never freezes and never runs out: it stacks up to {ascEternalWinter}.', 'No Freeze and no Shatter from Chill (Absolute Zero still freezes).', [
        ['ascEternalWinter', 'max Chill', 6, 1],
      ]),
      node('C1', 'Hoarfrost', 'At the end of every turn you Block, gain Shield {ascHoarfrost}.', 'ascHoarfrost', 'Shield', 8),
      node('C2', 'Ice Lance', 'While you have Shield, chain slot 1 deals +{ascIceLance} dmg.', 'ascIceLance', 'slot 1 dmg +', 6),
      capstone('C3', 'Avalanche', 'When you Strike, all your Shield breaks into the chain: every card +1 dmg per {ascAvalanche} Shield.', 'Your Shield is gone for that turn\'s hits.', [
        ['ascAvalanche', 'Shield per +1 dmg', 10, 1],
      ]),
      node('D1', 'Cold Hands', 'When you Freeze the enemy, their {ascColdHands} oldest Field cards go to the bottom of their deck.', 'ascColdHands', 'cards', 1),
      node('D2', 'Frost Lock', 'When the enemy has {ascFrostLock}+ Chill after your chain, they can\'t Charge next turn.', 'ascFrostLock', 'Chill needed', 3, 1),
      capstone('D3', 'Glacial Prison', 'Frozen lasts {ascGlacialPrison} more turn: the enemy can\'t Strike for longer.', 'Freeze needs {ascGlacialPrisonCost} more Chill.', [
        ['ascGlacialPrison', 'turns +', 1],
        ['ascGlacialPrisonCost', 'Cost: stacks to freeze +', 1],
      ]),
    ],
  },
}

/** Every loadout number, by tuning group. */
export const LOADOUT_FIELDS: Record<string, LoadoutField[]> = (() => {
  const out: Record<string, LoadoutField[]> = { MINOR: MINORS.flatMap((m) => m.fields) }
  for (const [c, list] of Object.entries(OATHS)) out[c] = list.flatMap((o) => o.fields)
  for (const [s, t] of Object.entries(TREES)) out[s] = t.nodes.flatMap((n) => n.fields)
  return out
})()

/** game_config key of a Minor number: minor_second_breath_hp */
export const minorConfigKey = (key: string) => `minor_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`
