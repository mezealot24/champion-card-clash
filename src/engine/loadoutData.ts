// Loadout content (design/customization-options-2026-10-18.md): Sigil · Oath (per Champion, no Cost since Q 2026-10-25),
// Sigil II · Minor (shared, small; off in the UI since 2026-10-25) and the Ascendancy tree of each Style (v2 since 2026-10-25: 4 branches × 3 nodes, the last a capstone with a Cost).
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
 * rev: bump when the nodes change meaning, so trees saved on a device for an older version start empty.
 */
export type TreeData = { branches: string[]; nodes: PieceData[]; depth?: number; bonusPoints?: number; rev?: number }

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
 * Ascendancy tree per Style. Node ids A1..A4 / B1..B4 (Mage, Tank, Assassin: A1..D3); take them top-down in a branch, the last node = capstone.
 * Numbers live in the Style's group (champion_styles.params) as asc<ID> (Mage / Tank / Assassin v2: named asc keys).
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
      // Q 2026-10-25 (after sim): Endurance = −dmg per hit + HP regen per charge; gained by Charge or by taking 2+ hits
      multi('A1', 'Unflinching', 'Gain 1 Endurance each time you Charge, or when 2+ hits reach you in a turn (an Ignite burn counts as 1); max {ascEnduranceMax}. Each Endurance: hits that reach you deal {ascEnduranceCut} less dmg, and you regain {ascEnduranceRegen}% Max HP at the end of every turn. Endurance fades after {ascEnduranceTurns} turns without a new one.', [
        ['ascEnduranceMax', 'max Endurance', 3, 1],
        ['ascEnduranceTurns', 'turns before it fades', 3, 1],
        ['ascEnduranceCut', 'dmg cut per hit, per Endurance', 2],
        ['ascEnduranceRegen', 'regen % Max HP per Endurance', 1],
      ]),
      multi('A2', 'Unyielding', 'Your cards deal +{ascUnyielding} dmg per Endurance. Endurance max +{ascUnyieldingMax}.', [
        ['ascUnyielding', 'dmg per Endurance', 2],
        ['ascUnyieldingMax', 'max Endurance +', 1],
      ]),
      capstone('A3', 'Unrelenting', 'Endurance max +{ascUnrelenting}. Hit dmg you take is not lost at once: it drains over the next {ascUnrelentingTurns} turns instead.', 'TBD (Q to pick).', [
        ['ascUnrelenting', 'max Endurance +', 2],
        ['ascUnrelentingTurns', 'turns the dmg drains over', 3, 1],
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
      // Q 2026-10-25 (after sim): no Cost (Bloom was worse than no tree); Charge heals instead
      multi('A3', 'Ancient', 'Titan Bloom cap +{ascAncient} and +{ascAncientHit} Max HP per hit taken. Each time you Charge, heal {ascAncientHeal} + {ascAncientPct}% of your missing HP.', [
        ['ascAncient', 'cap +', 100],
        ['ascAncientHit', 'per hit taken +', 2],
        ['ascAncientHeal', 'Charge heal', 4],
        ['ascAncientPct', 'Charge heal % of missing HP', 4, 0, 100],
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
        ['ascTimeOfNeed', 'every N turns', 5, 1],
        ['ascTimeOfNeedHeal', 'heal', 4],
        ['ascTimeOfNeedPct', 'heal % of missing HP', 5, 0, 100],
        ['ascTimeOfNeedCost', 'Cost: cap −', 100],
      ]),
    ],
  },
  /**
   * Bruiser v2 (Q 2026-10-25, design/bruiser-ascendancy-v2-2026-10-25.md): same shape as Mage / Tank / Assassin v2.
   * Fury from PoE Berserker + Sett (Payback spends the Rage you already have) + Precision ideas; Juggernaut from
   * Gladiator + Slayer + Resolve ideas. Names are our own (no LoL rune / PoE notable names). Everything that stacks has a cap.
   */
  'BR:1': {
    branches: ['Carnage', 'Blood Rite', 'Payback', 'Comeback'],
    depth: 3,
    bonusPoints: 1,
    rev: 2,
    nodes: [
      node('A1', 'Short Fuse', 'Fury HP line +{ascShortFuse}%.', 'ascShortFuse', 'HP line % +', 5),
      node('A2', 'Heavy Hands', 'Fury bonus +{ascHeavyHands} dmg.', 'ascHeavyHands', 'bonus dmg +', 2),
      capstone('A3', 'Bloodbath', 'Fury reaches every chain slot.', 'While Fury is on, hits that reach you deal +{ascBloodbathCost} dmg.', [
        ['ascBloodbathCost', 'Cost: dmg taken + per hit', 2],
      ]),
      node('B1', 'Seething', '+{ascSeething} Rage per clean hit.', 'ascSeething', 'Rage per clean hit +', 1),
      multi('B2', 'War Cry', 'When you Strike, chain slot 1 +1 dmg per {ascWarCry} Rage you have (max +{ascWarCryCap}).', [
        ['ascWarCry', 'Rage per +1 dmg', 5, 1],
        ['ascWarCryCap', 'dmg cap', 4],
      ]),
      capstone('B3', 'Blood Rite', 'Rage cap +{ascBloodRite} and you never lose Rage on a quiet turn.', 'At the end of every turn, lose 1 HP per {ascBloodRiteCost} Rage you have (never below 1 HP).', [
        ['ascBloodRite', 'Rage cap +', 10],
        ['ascBloodRiteCost', 'Cost: Rage per 1 HP lost', 5, 1],
      ]),
      node('C1', 'One-Two', 'Every 2nd P card in your chain deals +{ascOneTwo} dmg.', 'ascOneTwo', 'dmg + on every 2nd P', 3),
      multi('C2', 'Wind Up', 'Charge while you have Rage: you are Wound Up. Your next Strike is a Payback: after your S cards pay, chain slot 1 spends all Rage left, +{ascPayback} dmg per Rage. If a hit reaches you the turn you wind up, Wound Up is lost and you gain {ascFlinchRage} Rage.', [
        ['ascPayback', 'dmg per Rage', 1],
        ['ascFlinchRage', 'Rage when interrupted', 10],
      ]),
      capstone('C3', 'Knockout', 'Your Payback ignores Block and gives you Shield equal to {ascKnockout}% of the Rage it spent.', 'Fury bonus −{ascKnockoutCost} dmg.', [
        ['ascKnockout', 'Shield % of Rage spent', 50, 0, 100],
        ['ascKnockoutCost', 'Cost: Fury bonus −', 4],
      ]),
      node('D1', 'Bloodletting', 'Lifesteal {ascBloodletting}% while Fury is on.', 'ascBloodletting', 'Lifesteal %', 10, 0, 100),
      node('D2', 'Underdog', 'While the enemy has more HP than you, your cards deal +{ascUnderdog} dmg.', 'ascUnderdog', 'dmg +', 1),
      capstone('D3', 'Rally', 'When one Strike takes {ascRally}%+ of the enemy\'s Max HP, heal {ascRallyHeal} + {ascRallyPct}% of your missing HP.', 'Fury HP line −{ascRallyCost}%.', [
        ['ascRally', 'enemy Max HP % needed', 15, 1, 100],
        ['ascRallyHeal', 'heal', 4, 4],
        ['ascRallyPct', 'heal % of missing HP', 10, 0, 100],
        ['ascRallyCost', 'Cost: Fury HP line % −', 10],
      ]),
    ],
  },
  'BR:2': {
    branches: ['Arena', 'Verdict', 'Hunger', 'Bulwark'],
    depth: 3,
    bonusPoints: 1,
    rev: 2,
    nodes: [
      node('A1', 'Unshaken', 'A Block costs {ascUnshaken} fewer Momentum.', 'ascUnshaken', 'stacks lost −', 1),
      node('A2', 'Riposte', "When your Block stops every hit, your next Strike's slot 1 deals +{ascRiposte} dmg (doesn't stack).", 'ascRiposte', 'slot 1 dmg +', 4),
      capstone('A3', 'Retaliation', 'Each hit your Block stops gives +1 Momentum (max {ascRetaliation} a turn).', 'Lifesteal at max Momentum −{ascRetaliationCost}%.', [
        ['ascRetaliation', 'Momentum per turn (cap)', 2],
        ['ascRetaliationCost', 'Cost: Lifesteal % −', 5],
      ]),
      node('B1', 'Cleave', 'While the enemy is in the red (30% HP), your cards deal +{ascCleave} dmg.', 'ascCleave', 'dmg +', 2),
      node('B2', 'Bloodhound', 'Once per match, when your Strike puts the enemy in the red, gain {ascBloodhound} Momentum.', 'ascBloodhound', 'Momentum +', 3),
      capstone('B3', 'Final Verdict', 'At max Momentum, a Strike that leaves the enemy at {ascVerdict}% Max HP or less finishes them.', 'Momentum max +{ascVerdictCost}.', [
        ['ascVerdict', 'finish at % Max HP', 15, 0, 50],
        ['ascVerdictCost', 'Cost: max stacks +', 1],
      ]),
      node('C1', 'Hungry Steel', 'Max-Momentum Lifesteal +{ascHungrySteel}%.', 'ascHungrySteel', 'Lifesteal % +', 5),
      node('C2', 'Gorged', 'While you have Lifesteal from Momentum, hits that reach you deal {ascGorged} less dmg.', 'ascGorged', 'dmg cut per hit', 2),
      capstone('C3', 'Insatiable', 'Momentum Lifesteal works from {ascInsatiable} stacks, not only at max.', '−{ascInsatiableCost} Max HP.', [
        ['ascInsatiable', 'stacks needed', 3, 1],
        ['ascInsatiableCost', 'Cost: Max HP −', 20],
      ]),
      node('D1', 'Plating', 'After a turn a hit reaches you, hits that reach you next turn deal {ascPlating} less dmg.', 'ascPlating', 'dmg cut per hit', 2),
      multi('D2', 'Iron Grip', 'Every {ascIronGrip} turns, your next Strike heals {ascIronGripHeal} and gives +{ascIronGripHp} Max HP (max +{ascIronGripCap} a match).', [
        ['ascIronGrip', 'every N turns', 3, 1],
        ['ascIronGripHeal', 'heal', 4, 4],
        ['ascIronGripHp', 'Max HP +', 2],
        ['ascIronGripCap', 'Max HP cap a match', 10],
      ]),
      capstone('D3', 'Quake', 'When Momentum reaches max: for {ascQuakeTurns} turns hits that reach you deal {ascQuake} less, then the enemy loses {ascQuakeDmg} HP.', 'No Tenacity.', [
        ['ascQuake', 'dmg cut per hit', 3],
        ['ascQuakeTurns', 'turns', 2, 1],
        ['ascQuakeDmg', 'HP lost by the enemy', 10],
      ]),
    ],
  },
  /**
   * Assassin v2 (Q 2026-10-25, design/assassin-ascendancy-v2-2026-10-25.md): same shape as Mage / Tank v2, from PoE
   * Shadow (Assassin, Trickster, Saboteur). Everything that stacks has a cap (Hoarfrost lesson).
   */
  'AS:1': {
    branches: ['Overdrive', 'Acceleration', 'Shadowstep', 'Sabotage'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      node('A1', 'Redline', 'Overdrive +{ascRedline} dmg per Energy.', 'ascRedline', 'dmg per Energy +', 1),
      node('A2', 'Hair Trigger', 'Overdrive needs {ascHairTrigger} fewer chain card.', 'ascHairTrigger', 'min chain −', 1),
      capstone('A3', 'Afterburner', 'After an Overdrive Strike, get {ascAfterburner} Energy back at the end of the turn.', 'Acceleration no longer fills your Energy (it still draws).', [
        ['ascAfterburner', 'Energy back', 2],
      ]),
      node('B1', 'Quick Hands', 'Acceleration draws {ascQuickHands} more.', 'ascQuickHands', 'draw +', 1),
      node('B2', 'Slipstream', 'When Strike meets Strike, hits that reach you deal {ascSlipstream} less dmg.', 'ascSlipstream', 'dmg cut per hit', 2),
      capstone('B3', 'Mach Speed', "Acceleration also fires when you Strike into the enemy's Charge.", 'Start the match with {ascMachCost} fewer card on your Field.', [
        ['ascMachCost', 'Cost: cards at start −', 1, 0, 5],
      ]),
      node('C1', 'Escape Artist', 'When the enemy Strikes and your Block stops every hit, gain {ascEscapeArtist} Energy.', 'ascEscapeArtist', 'Energy', 1),
      multi('C2', 'Ghost Veil', 'Each turn no hit reaches you, gain 1 Veil (max {ascVeilMax}). Each Veil: hits that reach you deal {ascVeil} less dmg. A turn hits reach you, all Veil is gone after it.', [
        ['ascVeil', 'dmg cut per Veil', 1],
        ['ascVeilMax', 'max Veil', 3, 1],
      ]),
      capstone('C3', 'Wraith Form', 'Energy Surge switches on at {ascWraithForm} less Energy than a full bar.', '−{ascWraithFormCost} Max HP.', [
        ['ascWraithForm', 'Energy less', 1, 0, 2],
        ['ascWraithFormCost', 'Cost: Max HP −', 20],
      ]),
      node('D1', 'Snare', 'When you Charge and the enemy Blocks, Cut their {ascSnare} newest Field card.', 'ascSnare', 'cards Cut', 1, 0, 2),
      node('D2', 'Tripwire', 'When you Block and the enemy Charges, Cut their {ascTripwire} newest Field card after they draw.', 'ascTripwire', 'cards Cut', 1, 0, 2),
      capstone('D3', 'Demolition', 'Your Cut cards Cut {ascDemolition} more card (still max 2 Cuts a turn).', 'Your Cut cards deal {ascDemolitionCost} less dmg.', [
        ['ascDemolition', 'Cut +', 1, 0, 2],
        ['ascDemolitionCost', 'Cost: Cut card dmg −', 2],
      ]),
    ],
  },
  'AS:2': {
    branches: ['Execution', 'Crescendo', 'Venom', 'Shadow'],
    depth: 3,
    bonusPoints: 1,
    nodes: [
      node('A1', 'Blood Scent', 'Low HP line +{ascBloodScent}%.', 'ascBloodScent', 'HP line % +', 5),
      node('A2', 'Merciless', 'Critical vs low HP ×{ascMerciless} more.', 'ascMerciless', 'multiplier +', 1),
      capstone('A3', 'Executioner', 'A Critical that leaves the enemy at {ascExecutioner}% Max HP or less finishes them.', 'Criticals vs HP above the low line ×{ascExecutionerCost} less.', [
        ['ascExecutioner', 'finish at % Max HP', 10, 0, 50],
        ['ascExecutionerCost', 'Cost: Critical multiplier −', 1],
      ]),
      node('B1', 'Primed', 'The Critical counter starts at {ascPrimed}.', 'ascPrimed', 'counter at start', 2),
      node('B2', 'Off-Beat', 'Each hit your Block stops adds 1 to the Critical counter, up to {ascOffBeat} a turn.', 'ascOffBeat', 'counter + per turn (cap)', 2),
      capstone('B3', 'Crescendo', 'Critical every {ascCrescendo} fewer attack.', 'Criticals ×{ascCrescendoCost} less (vs low HP too).', [
        ['ascCrescendo', 'every N −', 1],
        ['ascCrescendoCost', 'Cost: Critical multiplier −', 1],
      ]),
      multi('C1', 'Toxic Strike', 'Each Critical (clean or Blocked) gives the enemy {ascToxic} Venom (max {ascVenomMax}). At the end of every turn they lose 1 HP per Venom, then Venom drops by 1.', [
        ['ascToxic', 'Venom per Critical', 2],
        ['ascVenomMax', 'max Venom', 6, 1],
      ]),
      multi('C2', 'Virulent', 'While the enemy has {ascVirulentAt}+ Venom, every chain card +{ascVirulent} dmg.', [
        ['ascVirulent', 'dmg +', 1],
        ['ascVirulentAt', 'Venom needed', 3, 1],
      ]),
      capstone('C3', 'Noxious', 'Venom no longer drops by itself and burns +{ascNoxious} HP per stack.', 'Blocked Criticals deal 0.', [
        ['ascNoxious', 'burn per stack +', 1],
      ]),
      node('D1', 'Feint', 'Blocked Criticals deal +{ascFeint}% dmg.', 'ascFeint', 'blocked dmg % +', 25),
      node('D2', 'Ghost Dance', "After a Strike with a Critical, gain Parry {ascGhostDance} for the next turn (doesn't stack).", 'ascGhostDance', 'Parry', 1),
      capstone('D3', 'Unseen Strike', 'Criticals ignore Block.', 'Critical every {ascUnseenCost} more attack.', [
        ['ascUnseenCost', 'Cost: every N +', 1],
      ]),
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
