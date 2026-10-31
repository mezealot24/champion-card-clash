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
 * maxCapstones: how many capstones one loadout may take (Mage: 1, Q 2026-10-25, two of them clashed).
 */
export type TreeData = { branches: string[]; nodes: PieceData[]; depth?: number; bonusPoints?: number; rev?: number; maxCapstones?: number }

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
/** Shown under the Lifeline Style text: how ⛨ Endurance works (Tank v3, Q 2026-10-28); numbers filled from TK:1 */
export const ENDURANCE_TEXT = '⛨ Endurance: canisters, max {endMax}. Gain 1 (once a turn each) when you pay an S card\'s HP cost, when one hit deals you {endHeavyPct}%+ of your Max HP, or when 2+ hits reach you in a turn. When you Strike, collect them all: heal {endHealPct}% of your missing HP each (×2 below {hpPct}% HP) and slot 1 +{endSlotDmg} dmg each. Reaching the cap on a turn you don\'t Strike: counter-spin, {spinDmg} dmg each to the opponent (ignores Block and Shield). Below {hpPct}% HP, S cards cost 1 Endurance instead of HP.'

export const TREES: Record<string, TreeData> = {
  /**
   * Tank v2 (Q 2026-10-25, design/tank-ascendancy-v2-2026-10-25.md): same shape as Mage v2, from PoE Juggernaut
   * (Lifeline) and Guardian (Titan Bloom). Everything that stacks has a cap (Hoarfrost lesson).
   */
  /**
   * Tank v3 (Q 2026-10-28, design/tank-rework-v3-lifeline-asc-2026-10-28.md / tank-rework-v3-titan-bloom-2026-10-28.md).
   * Names are placeholders (themes only), to be renamed before Beta.
   */
  'TK:1': {
    branches: ['Endurance', 'Masochism', 'Resolve', 'Berserker'],
    depth: 3,
    bonusPoints: 1,
    rev: 3,
    nodes: [
      multi('A1', 'Unflinching', 'Gain 1 Endurance when your Strike hits clean (after the collect, so it carries to your next turn). Endurance cap +{ascUnflinchingMax}.', [
        ['ascUnflinchingMax', 'Endurance cap +', 1],
      ]),
      node('A2', 'Pressure', 'When you collect, every chain card +{ascPressure} dmg per Endurance collected (not only slot 1).', 'ascPressure', 'dmg per card per Endurance', 1),
      capstone('A3', 'Whirl', 'A counter-spin also undoes half the hit dmg you took that turn and heals {ascWhirl}% of your missing HP per Endurance spent.', 'Your Field holds at most {ascWhirlField} cards.', [
        ['ascWhirl', 'heal % missing HP per Endurance', 2, 0, 100],
        ['ascWhirlField', 'Cost: Field max cards', 4, 1, 5],
      ]),
      multi('B1', 'Thick Skull', 'Lifeline red line +{ascThickSkull}%. Each time you lose {ascThickSkullLoss}% of your Max HP (S costs count), gain 1 Endurance (once a turn).', [
        ['ascThickSkull', 'red line % +', 5],
        ['ascThickSkullLoss', '% Max HP lost per Endurance', 15, 1],
      ]),
      node('B2', 'Shrug Off', 'The first lock each turn (Charge break, can\'t Charge / Block / Strike, Frozen) doesn\'t happen to you: lose {ascShrugOff}% of your current HP and gain 1 Endurance instead.', 'ascShrugOff', '% current HP paid', 7, 0, 100),
      capstone('B3', 'Bloodied', 'The first time you drop into the red: for {ascBloodied} turns gain 1 Endurance at the end of every turn, and chain slot 1 +1 dmg per 10% of your missing HP.', 'You can\'t gain Shield.', [
        ['ascBloodied', 'turns', 3, 1],
      ]),
      multi('C1', 'Steady', 'Each turn, the {ascSteadyHits} hits after the first that reach you deal {ascSteady} less. A Charge break can\'t throw away your first {ascSteadySafe} Field cards.', [
        ['ascSteady', 'dmg cut per hit', 3],
        ['ascSteadyHits', 'hits cut', 2, 0],
        ['ascSteadySafe', 'safe slots', 2, 0, 5],
      ]),
      multi('C2', 'Overflow', 'Healing past your Max HP becomes Shield (up to {ascOverflow}). When you Strike with Shield, slot 1 +dmg equal to half your Shield.', [
        ['ascOverflow', 'Shield cap', 20],
      ]),
      capstone('C3', 'Duel', 'After 2 turns in a row where both sides Strike, your next Strike that hits clean also deals {ascDuel}% of your Max HP, heals you {ascDuelHeal}% of your Max HP and steals {ascDuelSteal} Max HP from the opponent (up to {ascDuelCap} a match).', 'Your S cards cost {ascDuelCost}% of your current HP more.', [
        ['ascDuel', 'dmg % of your Max HP', 4, 0, 100],
        ['ascDuelHeal', 'heal % of your Max HP', 2, 0, 100],
        ['ascDuelSteal', 'Max HP stolen', 6],
        ['ascDuelCap', 'Max HP stolen cap', 30],
        ['ascDuelCost', 'Cost: S cost + % current HP', 5, 0, 100],
      ]),
      multi('D1', 'Momentum', 'Each Strike in a row (no other action between) gives every chain card +{ascMomentum} dmg, up to +{ascMomentumCap}. At the end of a turn the opponent didn\'t Strike, they lose {ascMomentumChip} HP.', [
        ['ascMomentum', 'dmg per Strike in a row', 1],
        ['ascMomentumCap', 'max dmg', 3],
        ['ascMomentumChip', 'HP lost when they don\'t Strike', 4],
      ]),
      node('D2', 'Spin to Win', 'Counter-spin deals +{ascSpin} more per Endurance, and also fires when your Block stops 2+ hits.', 'ascSpin', 'spin dmg + per Endurance', 3),
      capstone('D3', 'Culling Blade', 'When you collect, every chain card +{ascCulling} dmg per Endurance. After one of your S cards resolves, if the opponent\'s HP is below {ascCullingPct}% of your Max HP, they are knocked out (ignores Block and Shield).', 'After a collect, next turn you are Vulnerable (+{ascCullingVuln}% dmg taken) and can\'t Block.', [
        ['ascCulling', 'dmg per card per Endurance', 2],
        ['ascCullingPct', 'knock-out line, % of your Max HP', 15, 0, 100],
        ['ascCullingVuln', 'Cost: Vulnerable %', 35, 0, 100],
      ]),
    ],
  },
  'TK:2': {
    branches: ['Bloom', 'Butcher', 'Timber', 'Time of Need'],
    depth: 3,
    bonusPoints: 1,
    rev: 4,
    nodes: [
      node('A1', 'Taproot', 'Facing pairs give +{ascTaproot} more Vigor each.', 'ascTaproot', 'Vigor per facing +', 1),
      node('A2', 'Seedling', 'Start the match with {ascSeedling} Max HP already grown.', 'ascSeedling', 'Max HP grown at start', 20),
      capstone('A3', 'Ancient', 'Titan Bloom cap +{ascAncient} and +{ascAncientHit} Max HP per hit taken. When you Charge, heal {ascAncientPct}% of your missing HP.', 'The Colossus line is {ascAncientCost} higher (+60 → +90 grown).', [
        ['ascAncient', 'cap +', 100],
        ['ascAncientHit', 'per hit taken +', 2],
        ['ascAncientPct', 'Charge heal % of missing HP', 2, 0, 100],
        ['ascAncientCost', 'Cost: Colossus line +', 30],
      ]),
      node('B1', 'Fresh Vigor', 'Clean hits you land give +{ascFreshMeat}% of your Max HP more Vigor each.', 'ascFreshMeat', 'Vigor % Max HP per clean hit +', 1, 0, 100),
      node('B2', 'Butcher\'s Brand', 'Your first clean hit in a Strike brands the opponent. On your next Strike, each clean hit on them heals you {ascBrand}% of your grown Max HP.', 'ascBrand', 'heal % of grown Max HP per clean hit', 1, 0, 100),
      capstone('B3', 'Carve', 'Each clean hit steals {ascCarve} Max HP from the opponent (up to {ascCarveCap} a match) and adds it to your grown Max HP.', 'You get no healing from cards at all.', [
        ['ascCarve', 'Max HP stolen per clean hit', 2],
        ['ascCarveCap', 'cap a match', 40],
      ]),
      node('C1', 'Heartwood', 'Titan Bloom needs {ascHeartwood} less Max HP grown for each +1 dmg.', 'ascHeartwood', 'HP per dmg −', 5),
      multi('C2', 'Ironbark Fist', 'Chain slot 1 deals +1 dmg per {ascIronbark} Max HP grown, up to +{ascIronbarkCap}.', [
        ['ascIronbark', 'Max HP grown per +1', 8, 1],
        ['ascIronbarkCap', 'dmg cap', 10],
      ]),
      capstone('C3', 'Titan\'s Rise', 'Become a Colossus from +{ascTreeGrab} grown. A Colossus Slam costs only {ascTreeGrabCost} grown and gives every card +{ascTreeGrabDmg} dmg.', 'Your Field holds at most {ascTreeGrabField} cards all match.', [
        ['ascTreeGrab', 'Colossus line (grown)', 40],
        ['ascTreeGrabCost', 'Colossus Slam cost (grown)', 30],
        ['ascTreeGrabDmg', 'Colossus Slam dmg per card', 10],
        ['ascTreeGrabField', 'Cost: Field max cards', 4, 1, 5],
      ]),
      // Time of Need branch (Q 2026-10-29): Living Bark + Rooted are one node, Time of Need moves up to T2 (no Cost),
      // the new keystone is Grasp of the Undying
      multi('D1', 'Living Bark', 'Titan Bloom: +{ascLivingBark} more Max HP per debuff stack (end of turn). While you have 3+ debuff stacks, hits that reach you deal {ascRooted} less dmg.', [
        ['ascLivingBark', 'per debuff stack +', 3],
        ['ascRooted', 'dmg cut per hit at 3+ debuff stacks', 2],
      ]),
      multi('D2', 'Time of Need', 'Every {ascTimeOfNeed} turns, at the end of the turn, remove every debuff on you and heal {ascTimeOfNeedPct}% of your missing HP.', [
        ['ascTimeOfNeed', 'every N turns', 5, 1],
        ['ascTimeOfNeedPct', 'heal % of missing HP', 3, 0, 100],
      ]),
      capstone('D3', 'Grasp of the Undying', 'Once per match, when your HP would drop below 1: you are Undying for {ascUndyingTurns} turns and draw {ascUndyingDraw}. While Undying you can\'t die and can\'t be healed by anything, and every chain card deals +{ascUndyingPct}% of your Max HP dmg ({ascUndyingBlockedPct}% of that when Blocked).', 'Titan Bloom cap −{ascUndyingCost}.', [
        ['ascUndyingTurns', 'Undying turns', 3, 1],
        ['ascUndyingDraw', 'cards drawn', 2, 0, 5],
        ['ascUndyingPct', 'dmg per card, % of your Max HP', 10, 0, 100],
        ['ascUndyingBlockedPct', 'share of that dmg when Blocked %', 50, 0, 100],
        ['ascUndyingCost', 'Cost: Titan Bloom cap −', 100],
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
    rev: 3,
    nodes: [
      multi('A1', 'Short Fuse', 'Fury HP line +{ascShortFuse}%. The first time Fury turns on in a match, gain {ascShortFuseRage} Rage.', [
        ['ascShortFuse', 'HP line % +', 10],
        ['ascShortFuseRage', 'Rage the first time Fury turns on', 5],
      ]),
      multi('A2', 'Heavy Hands', 'Every chain card +{ascHeavyHands} dmg, or +{ascHeavyHandsFury} while Fury is on.', [
        ['ascHeavyHands', 'dmg + (no Fury)', 1],
        ['ascHeavyHandsFury', 'dmg + while Fury is on', 3],
      ]),
      capstone('A3', 'Bloodbath', 'Fury reaches every chain slot.', 'While Fury is on, hits that reach you deal +{ascBloodbathCost} dmg.', [
        ['ascBloodbathCost', 'Cost: dmg taken + per hit', 2],
      ]),
      node('B1', 'Seething', '+{ascSeething} Rage each time you lose HP (your own cards or the enemy) and per clean hit.', 'ascSeething', 'Rage +', 1),
      multi('B2', 'War Cry', 'When you Strike, every chain card +1 dmg per {ascWarCry} Rage you have (max +{ascWarCryCap} a card).', [
        ['ascWarCry', 'Rage per +1 dmg', 5, 1],
        ['ascWarCryCap', 'dmg cap per card', 3],
      ]),
      // Cost was an HP burn every turn, which stacked with Bruiser's own HP-cost cards and lost games (sim 2026-10-25)
      capstone('B3', 'Blood Rite', 'Rage cap +{ascBloodRite} and you never lose Rage on a quiet turn.', 'Your Block stops {ascBloodRiteCost} fewer hit.', [
        ['ascBloodRite', 'Rage cap +', 10],
        ['ascBloodRiteCost', 'Cost: Block stops − hits', 1],
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
      capstone('D3', 'Rally', 'When one Strike takes {ascRally}%+ of the enemy\'s Max HP, heal {ascRallyHeal} + {ascRallyPct}% of your missing HP.', '−{ascRallyCost} Max HP.', [
        ['ascRally', 'enemy Max HP % needed', 15, 1, 100],
        ['ascRallyHeal', 'heal', 4, 4],
        ['ascRallyPct', 'heal % of missing HP', 10, 0, 100],
        ['ascRallyCost', 'Cost: Max HP −', 15],
      ]),
    ],
  },
  'BR:2': {
    branches: ['Arena', 'Verdict', 'Hunger', 'Bulwark'],
    depth: 3,
    bonusPoints: 1,
    rev: 3,
    nodes: [
      node('A1', 'Take the Hit', "After a turn the enemy Strikes you (into your Block or not), your next Strike's slot 1 deals +{ascTakeHit} dmg (doesn't stack).", 'ascTakeHit', 'slot 1 dmg +', 4),
      multi('A2', 'Riposte', 'A Block costs {ascUnshaken} fewer Momentum. When your Block stops every hit, your next Strike: every card +{ascRiposte} dmg (doesn\'t stack).', [
        ['ascRiposte', 'dmg + every card', 2],
        ['ascUnshaken', 'Block Momentum loss −', 1],
      ]),
      capstone('A3', 'Retaliation', 'Each hit your Block stops gives +1 Momentum (max {ascRetaliation} a turn). When you Strike, take up to {ascSunder} enemy Shield per Momentum and keep it as your Shield (max {ascSunderCap}).', 'Lifesteal at max Momentum −{ascRetaliationCost}%.', [
        ['ascRetaliation', 'Momentum per turn (cap)', 2],
        ['ascSunder', 'Shield taken per Momentum', 2],
        ['ascSunderCap', 'Shield taken cap', 8],
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
      capstone('A3', 'Echo', "An Overdrive Strike replays its strongest chain card once at {ascEcho}% dmg (no effects). The enemy's Block stops it.", 'Lose {ascEchoCost} Energy at the end of that turn.', [
        ['ascEcho', 'replay dmg %', 50, 0, 100],
        ['ascEchoCost', 'Cost: Energy lost', 1],
      ]),
      node('B1', 'Quick Hands', 'Acceleration draws {ascQuickHands} more.', 'ascQuickHands', 'draw +', 1),
      node('B2', 'Slipstream', 'When Strike meets Strike, hits that reach you deal {ascSlipstream} less dmg.', 'ascSlipstream', 'dmg cut per hit', 2),
      capstone('B3', 'Mach Speed', "When you Strike into the enemy's Charge, draw {ascMachDraw} at the end of the turn (no Energy).", 'Start the match with {ascMachCost} fewer card on your Field.', [
        ['ascMachCost', 'Cost: cards at start −', 1, 0, 5],
        ['ascMachDraw', 'draw on Strike into Charge', 1, 0, 5],
      ]),
      node('C1', 'Escape Artist', 'When the enemy Strikes and your Block stops every hit, gain {ascEscapeArtist} Energy.', 'ascEscapeArtist', 'Energy', 1),
      multi('C2', 'Ghost Veil', 'Each turn no hit reaches you, gain 1 Veil (max {ascVeilMax}). Each Veil: hits that reach you deal {ascVeil} less dmg. A turn hits reach you, all Veil is gone after it.', [
        ['ascVeil', 'dmg cut per Veil', 1],
        ['ascVeilMax', 'max Veil', 3, 1],
      ]),
      capstone('C3', 'Phantom', "After the enemy Strikes and no hit reaches you, your next Strike's first {ascPhantom} card can't be Blocked.", '−{ascPhantomCost} Max HP.', [
        ['ascPhantom', 'cards that ignore Block', 1, 0, 3],
        ['ascPhantomCost', 'Cost: Max HP −', 20],
      ]),
      multi('D1', 'Snare', 'When you Charge and the enemy Blocks with {ascSnareField}+ Field cards, Cut their {ascSnare} newest Field card.', [
        ['ascSnare', 'cards Cut', 1, 0, 2],
        ['ascSnareField', 'enemy Field cards needed', 4, 1, 5],
      ]),
      multi('D2', 'Tripwire', 'When you Block and the enemy Charges, Cut their {ascTripwire} newest Field card after they draw, if they then have {ascTripwireField}+.', [
        ['ascTripwire', 'cards Cut', 1, 0, 2],
        ['ascTripwireField', 'enemy Field cards needed', 5, 1, 5],
      ]),
      capstone('D3', 'Demolition', 'Your Cut cards Cut {ascDemolition} more card while the enemy has {ascDemolitionField}+ Field cards (still max 2 Cuts a turn).', 'Your Cut cards deal {ascDemolitionCost} less dmg.', [
        ['ascDemolition', 'Cut +', 1, 0, 2],
        ['ascDemolitionField', 'enemy Field cards needed', 4, 1, 5],
        ['ascDemolitionCost', 'Cost: Cut card dmg −', 2],
      ]),
    ],
  },
  'AS:2': {
    branches: ['Execution', 'Crescendo', 'Pursuit', 'Shadow'],
    depth: 3,
    bonusPoints: 1,
    rev: 1,
    nodes: [
      multi('A1', 'Blood Scent', 'Low HP line +{ascBloodScent}%. Attacks into a Low HP enemy deal +{ascBloodScentDmg} dmg.', [
        ['ascBloodScent', 'HP line % +', 5],
        ['ascBloodScentDmg', 'dmg vs Low HP', 2],
      ]),
      multi('A2', 'Merciless', 'Low HP line +{ascMercilessLine}%. Critical vs low HP ×{ascMerciless} more.', [
        ['ascMercilessLine', 'HP line % +', 5],
        ['ascMerciless', 'multiplier +', 1],
      ]),
      capstone('A3', 'Executioner', 'A Critical that leaves the enemy at {ascExecutioner}% Max HP or less finishes them.', 'Non-Critical attacks deal −{ascExecutionerNonCrit}% dmg.', [
        ['ascExecutioner', 'finish at % Max HP', 15, 0, 50],
        ['ascExecutionerNonCrit', 'Cost: non-Critical dmg −%', 20, 0, 100],
      ]),
      multi('B1', 'Primed', 'The Critical counter starts at {ascPrimed}. Each Charge adds {ascPrimedCharge} to it, once per turn.', [
        ['ascPrimed', 'counter at start', 2],
        ['ascPrimedCharge', 'counter + per Charge', 1, 0, 5],
      ]),
      multi('B2', 'Off-Beat', 'Each hit your Block or Parry stops adds 1 to the Critical counter, up to {ascOffBeat} a turn. After a Critical, the next cycle starts at {ascOffBeatReset}.', [
        ['ascOffBeat', 'counter + per turn (cap)', 2, 0, 5],
        ['ascOffBeatReset', 'counter after Critical', 1, 0, 5],
      ]),
      capstone('B3', 'Build-up', 'Each successful Critical gives your next Critical ×{ascBuildUp} more (max ×{ascBuildUpMax} more). A clean hit that reaches you resets it.', 'A Critical into a Block loses {ascBuildUpBlockedLoss} Build-up step and skips the next Critical counter.', [
        ['ascBuildUp', 'multiplier + per Critical', 1],
        ['ascBuildUpMax', 'max multiplier +', 3, 1],
        ['ascBuildUpBlockedLoss', 'Cost: Build-up lost per Blocked Critical', 1, 0],
      ]),
      multi('C1', 'Run Down', 'When your Strike meets their Charge, the Critical counter +{ascRunDownCounter} before the clash. Your first card deals +{ascRunDownDmg} dmg.', [
        ['ascRunDownCounter', 'counter +', 1, 0, 5],
        ['ascRunDownDmg', 'first card dmg +', 3],
      ]),
      multi('C2', 'Chase', 'A Strike with a Critical into their Charge, or into an enemy with {ascChaseField}+ Field cards, Cuts {ascChase} newest Field card.', [
        ['ascChase', 'cards Cut', 1, 0, 2],
        ['ascChaseField', 'enemy Field cards needed', 3, 1, 5],
      ]),
      capstone('C3', 'Hunt', 'Criticals into a Charge, or into an empty facing slot, ×{ascHunt} more.', 'Blocked Criticals deal only {ascHuntBlockedPct}% of dmg.', [
        ['ascHunt', 'multiplier +', 1],
        ['ascHuntBlockedPct', 'Cost: blocked Critical dmg %', 50, 0, 100],
      ]),
      multi('D1', 'Feint', 'Blocked Criticals deal +{ascFeint}% dmg and Pierce {ascFeintPierce}% of total dmg.', [
        ['ascFeint', 'blocked dmg % +', 25],
        ['ascFeintPierce', 'Pierce % of total dmg', 15, 0, 100],
      ]),
      multi('D2', 'Ghost Dance', "After a Strike with a Critical, gain Parry {ascGhostDance} for the next turn (doesn't stack). Each successful Parry adds {ascGhostDanceCounter} to the Critical counter.", [
        ['ascGhostDance', 'Parry', 1],
        ['ascGhostDanceCounter', 'counter + per Parry', 1, 0, 5],
      ]),
      capstone('D3', 'Shadow Mark', "A Critical Marks the enemy until the end of your next Strike. Your Strike into a Marked enemy: its first {ascShadowMark} card can't be Blocked, and their Parry and Shield break first.", 'Your Block effectiveness is −{ascShadowMarkBlockCut}%.', [
        ['ascShadowMark', 'cards that ignore Block', 1, 0, 3],
        ['ascShadowMarkBlockCut', 'Cost: Block effectiveness −%', 25, 0, 100],
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
    maxCapstones: 1,
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
    maxCapstones: 1,
    nodes: [
      node('A1', 'Brittle', 'Your cards deal +{ascBrittle}% dmg for each Chill stack on the enemy.', 'ascBrittle', 'dmg % per enemy Chill', 10),
      // Black Ice replaces Cold Snap (Q 2026-10-31 playtest): Shatter through Block, base half → full
      node('A2', 'Black Ice', 'Shatter through a Block is stronger: +{ascBlackIce}% of the full Shatter (up to 100%).', 'ascBlackIce', 'Shatter through Block % +', 50, 0, 100),
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
      // Glacier rework (Q 2026-10-31 playtest): Shield feeds Freeze. Rime Armor replaces Hoarfrost; Avalanche spends
      // only part of the Shield and turns it into Chill too
      node('C1', 'Rime Armor', 'Every hit your Shield soaks gives the attacker {ascRimeArmor} more Chill.', 'ascRimeArmor', 'Chill + per soaked hit', 1),
      node('C2', 'Ice Lance', 'While you have Shield, chain slot 1 deals +{ascIceLance} dmg.', 'ascIceLance', 'slot 1 dmg +', 4),
      capstone(
        'C3',
        'Avalanche',
        'When you Strike, your Shield breaks into the chain: every card +1 dmg per {ascAvalanche} Shield spent, and the enemy gets 1 Chill per {ascAvalancheChill} Shield spent. {ascAvalancheKeep}% of your Shield stays.',
        'The Shield spent is gone before that turn\'s hits.',
        [
          ['ascAvalanche', 'Shield per +1 dmg', 15, 1],
          ['ascAvalancheChill', 'Shield per 1 Chill', 10, 1],
          ['ascAvalancheKeep', 'Shield kept %', 50, 0, 100],
        ],
      ),
      node('D1', 'Cold Hands', 'When you Freeze the enemy, their {ascColdHands} oldest Field cards go to the bottom of their deck.', 'ascColdHands', 'cards', 1),
      node('D2', 'Frost Lock', 'When the enemy has {ascFrostLock}+ Chill after your chain, they can\'t Charge next turn.', 'ascFrostLock', 'Chill needed', 3, 1),
      capstone('D3', 'Glacial Prison', 'Frozen (and Thaw after it) lasts {ascGlacialPrison} more turn: the enemy can\'t Strike for longer.', 'Freeze needs {ascGlacialPrisonCost} more Chill.', [
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
