// Loadout content (design/customization-options-2026-10-18.md): Sigil · Oath (per Champion, no Cost since Q 2026-10-25),
// Sigil II · Minor (shared, small; off in the UI since 2026-10-25) and the Ascendancy tree of each Style (2 branches × 4 nodes, top-down; Mage and Tank: 4 branches × 3).
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
  /** what you pay (Ascendancy capstones) */
  cost?: string
  fields: LoadoutField[]
}

const f = (key: string, label: string, def: number, min = 0, max?: number): LoadoutField => ({ key, label, def, min, ...(max !== undefined ? { max } : {}) })

/**
 * Sigil · Oath, by Champion: the one Sigil a player picks (Q 2026-10-25: no Cost; 3 Oaths per class, each a different
 * way to play). Numbers live in the Champion's class group (champions.params).
 */
export const OATHS: Record<string, PieceData[]> = {
  TK: [
    { id: 'o1', name: 'Bulwark Oath', text: 'Your first Block of the match stops every hit.', fields: [] },
    { id: 'o2', name: 'Deep Roots', text: '+{deepRootsHp} Max HP and start HP.', fields: [f('deepRootsHp', 'Oath Deep Roots: Max HP +', 40)] },
    { id: 'o3', name: 'Thornhide', text: 'Each hit your Block stops deals {thornDmg} dmg back to the striker.', fields: [f('thornDmg', 'Oath Thornhide: dmg back per blocked hit', 4)] },
  ],
  BR: [
    { id: 'o1', name: 'Bloodlust', text: 'Lifesteal {bloodlustPct}% while your HP is below {bloodlustHpPct}%.', fields: [f('bloodlustPct', 'Oath Bloodlust: Lifesteal %', 25, 0, 100), f('bloodlustHpPct', 'Oath Bloodlust: HP line %', 30, 1, 100)] },
    { id: 'o2', name: 'Hot Blood', text: 'Start the match with {hotBloodRage} Rage.', fields: [f('hotBloodRage', 'Oath Hot Blood: Rage at start +', 10)] },
    { id: 'o3', name: 'Iron Hide', text: 'Every hit that reaches you deals {ironHideCut} less dmg.', fields: [f('ironHideCut', 'Oath Iron Hide: dmg cut per hit', 2)] },
  ],
  AS: [
    { id: 'o1', name: 'Shadow Edge', text: 'Chain slot 1 deals +{shadowEdgeDmg} dmg.', fields: [f('shadowEdgeDmg', 'Oath Shadow Edge: slot 1 dmg +', 6)] },
    { id: 'o2', name: 'Quickdraw', text: 'Start the match with {quickdrawCards} more cards on your Field.', fields: [f('quickdrawCards', 'Oath Quickdraw: cards at start +', 2, 0, 5)] },
    { id: 'o3', name: 'Vanish', text: 'Start the match with Parry {vanishParry}: the first hits that get past your Block deal 0.', fields: [f('vanishParry', 'Oath Vanish: Parry at start', 2)] },
  ],
  MG: [
    { id: 'o1', name: 'Overcharge', text: 'Mana cap +{overchargeCap}.', fields: [f('overchargeCap', 'Oath Overcharge: Mana cap +', 2)] },
    { id: 'o2', name: 'Arcane Ward', text: 'Start the match with Shield {arcaneWardShield}.', fields: [f('arcaneWardShield', 'Oath Arcane Ward: Shield at start', 20)] },
    { id: 'o3', name: 'Arcane Focus', text: 'All your cards deal +{glassFocusDmg} dmg.', fields: [f('glassFocusDmg', 'Oath Arcane Focus: all cards dmg +', 2)] },
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

/** A node with more than one number (a cap, a timer); its first field is {key}. */
const multi = (id: string, name: string, text: string, fields: [string, string, number, number?, number?][]): PieceData => ({
  id,
  name,
  text,
  fields: fields.map(([key, label, def, min, max]) => f(key, `Asc ${id} ${name}: ${label}`, def, min ?? 0, max)),
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
 * Ascendancy tree per Style. Node ids A1..A4 / B1..B4 (Mage, Tank: A1..D3); take them top-down in a branch, the last node = capstone.
 * Numbers live in the Style's group (champion_styles.params) as asc<ID> (Mage / Tank v2: named asc keys).
 */
export const TREES: Record<string, TreeData> = {
  /**
   * Tank v2 (Q 2026-10-25, design/tank-ascendancy-v2-2026-10-25.md): same shape as Mage v2, from PoE Juggernaut
   * (Lifeline) and Guardian (Titan Bloom). Everything that stacks has a cap (Hoarfrost lesson).
   */
  'TK:1': {
    branches: ['Endurance', 'Untiring', 'Unstoppable', 'Unbroken'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      multi('A1', 'Unflinching', 'Each turn 2+ hits reach you (an Ignite burn counts as 1), gain 1 Endurance (max {ascEnduranceMax}). Each Endurance: hits that reach you deal 1 less dmg. Endurance fades after {ascEnduranceTurns} turns without a new one.', [
        ['ascEnduranceMax', 'max Endurance', 3, 1],
        ['ascEnduranceTurns', 'turns before it fades', 3, 1],
      ]),
      node('A2', 'Unyielding', 'Your cards deal +{ascUnyielding} dmg per Endurance.', 'ascUnyielding', 'dmg per Endurance', 1),
      capstone('A3', 'Unrelenting', 'Endurance max +{ascUnrelenting}, and you gain 2 at a time. While your HP is in the red, at the end of the turn all your Endurance turns into a heal: {ascUnrelentingHeal} per stack.', 'The Endurance you heal with is gone, dmg cut and all.', [
        ['ascUnrelenting', 'max Endurance +', 2],
        ['ascUnrelentingHeal', 'heal per Endurance', 4],
      ]),
      node('B1', 'Early Rally', 'Lifeline HP line +{ascEarlyRally}%.', 'ascEarlyRally', 'HP line % +', 5),
      multi('B2', 'Untiring', 'Each hit your Block stops heals {ascUntiring}, up to {ascUntiringCap} a turn.', [
        ['ascUntiring', 'heal per stopped hit', 4],
        ['ascUntiringCap', 'heal cap per turn', 6],
      ]),
      capstone('B3', 'Second Wind', 'Lifeline can switch on one more time after it goes off.', '−{ascSecondWindCost} Max HP.', [['ascSecondWindCost', 'Cost: Max HP −', 20]]),
      node('C1', 'Unstoppable', 'A charge break can\'t throw away your first {ascUnstoppable} Field cards.', 'ascUnstoppable', 'safe slots', 2, 0, 5),
      node('C2', 'Unbreakable', 'The turn after you Charge, your Block stops {ascUnbreakable} more hit.', 'ascUnbreakable', 'Block stops +', 1),
      capstone('C3', 'Undeniable', 'Chain slot 1 ignores Block.', 'Your S cards cost {ascUndeniableCost}% more HP.', [
        ['ascUndeniableSlots', 'slots that ignore Block', 1, 0, 5],
        ['ascUndeniableCost', 'Cost: S cost % +', 50],
      ]),
      node('D1', 'Last Bastion', 'The first time your HP drops into the red, gain Shield {ascLastBastion}.', 'ascLastBastion', 'Shield', 30),
      node('D2', 'Defiance', 'While your HP is in the red, hits that reach you deal {ascDefiance} less dmg.', 'ascDefiance', 'dmg cut per hit', 2),
      capstone('D3', 'Unbroken', 'Once per match, a hit that would knock you out leaves you on 1 HP.', '−{ascUnbrokenCost} Max HP.', [
        ['ascUnbroken', 'times per match', 1],
        ['ascUnbrokenCost', 'Cost: Max HP −', 30],
      ]),
    ],
  },
  'TK:2': {
    branches: ['Bloom', 'Bramble', 'Timber', 'Time of Need'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      node('A1', 'Taproot', 'Titan Bloom: +{ascTaproot} Max HP per facing pair.', 'ascTaproot', 'per facing +', 1),
      node('A2', 'Seedling', 'Start the match with {ascSeedling} Max HP already grown.', 'ascSeedling', 'Max HP grown at start', 20),
      capstone('A3', 'Ancient', 'Titan Bloom cap +{ascAncient} and +{ascAncientHit} Max HP per hit taken.', 'Titan Bloom gives no dmg.', [
        ['ascAncient', 'cap +', 100],
        ['ascAncientHit', 'per hit taken +', 2],
      ]),
      node('B1', 'Bark Guard', 'Titan Bloom: +{ascBarkGuard} Max HP per hit Blocked.', 'ascBarkGuard', 'per hit Blocked +', 1),
      node('B2', 'Thorns', 'Each hit your Block stops deals {ascThorns} dmg back.', 'ascThorns', 'dmg back per hit', 2),
      capstone('B3', 'Briar Wall', 'After a Block, your next Strike: every card +{ascBriarWall} dmg per hit that Block stopped (up to {ascBriarWallCap} hits).', 'Titan Bloom grows nothing from hits Blocked.', [
        ['ascBriarWall', 'dmg per stopped hit', 2],
        ['ascBriarWallCap', 'hits counted (cap)', 3],
      ]),
      node('C1', 'Heartwood', 'Titan Bloom needs {ascHeartwood} less Max HP grown for each +1 dmg.', 'ascHeartwood', 'HP per dmg −', 5),
      multi('C2', 'Ironbark Fist', 'Chain slot 1 deals +1 dmg per {ascIronbark} Max HP grown, up to +{ascIronbarkCap}.', [
        ['ascIronbark', 'Max HP grown per +1', 10, 1],
        ['ascIronbarkCap', 'dmg cap', 8],
      ]),
      capstone('C3', 'Timber!', 'When you Strike with {ascTimberCards}+ cards, fell the tree: every card +1 dmg per {ascTimber} Max HP grown, up to +{ascTimberCap}.', 'Your grown Max HP goes back to 0 (Max HP drops, Titan Bloom dmg resets).', [
        ['ascTimberCards', 'chain cards needed', 4, 1, 5],
        ['ascTimber', 'Max HP grown per +1', 10, 1],
        ['ascTimberCap', 'dmg cap', 10],
      ]),
      node('D1', 'Living Bark', 'Titan Bloom: +{ascLivingBark} Max HP per debuff stack (end of turn).', 'ascLivingBark', 'per debuff stack +', 1),
      node('D2', 'Rooted', 'While you have 3+ debuff stacks, hits that reach you deal {ascRooted} less dmg.', 'ascRooted', 'dmg cut per hit', 2),
      capstone('D3', 'Time of Need', 'Every {ascTimeOfNeed} turns, at the end of the turn, remove every debuff on you and heal {ascTimeOfNeedHeal} + {ascTimeOfNeedPct}% of your missing HP.', 'Titan Bloom cap −{ascTimeOfNeedCost}.', [
        ['ascTimeOfNeed', 'every N turns', 3, 1],
        ['ascTimeOfNeedHeal', 'heal', 4],
        ['ascTimeOfNeedPct', 'heal % of missing HP', 5, 0, 100],
        ['ascTimeOfNeedCost', 'Cost: cap −', 100],
      ]),
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
      node('D2', 'Cauterize', 'At the end of every turn, heal {ascCauterize} for each Ignite stack on the enemy.', 'ascCauterize', 'heal per stack', 4),
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
      // Hoarfrost tops up to a cap (Q 2026-10-25: uncapped it stacked Shield 8 every Block, nothing got through)
      {
        id: 'C1',
        name: 'Hoarfrost',
        text: 'At the end of every turn you Block, gain Shield {ascHoarfrost}, up to {ascHoarfrostCap} Shield in total.',
        fields: [f('ascHoarfrost', 'Asc C1 Hoarfrost: Shield', 8), f('ascHoarfrostCap', 'Asc C1 Hoarfrost: Shield cap (total)', 24)],
      },
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
