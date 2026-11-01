// Keyword glossary (playtest 2026-10-30: card, Style and Ascendancy text read too long). Rules text says a keyword once,
// with no explanation in brackets; the card sheet and the Style sheet list what each keyword in it means, one short line.
// Game words stay English in Thai text too, so the names match in both languages.

/** Keyword → what it means, in a few words. Order = the order the sheet lists them. */
export const KEYWORDS: [string, string][] = [
  ['Clean hit', 'A hit no Block, Parry or Shield stopped.'],
  ['Charge break', 'Hit while Charging: your oldest Field card goes to the deck bottom.'],
  ['Shield', 'Soaks hit dmg before your HP does.'],
  ['Parry', 'Each point turns one hit that gets past Block into 0 dmg.'],
  ['Ignite', 'Burns HP at the end of every turn and cuts healing. Stacks.'],
  ['Chill', 'Each stack: that side hits for less. Full stacks = Frozen.'],
  ['Frozen', "Can't Strike next turn."],
  ['Thaw', "Can't be Frozen."],
  ['Sub-Zero', 'Each clean hit of your next Strike gives 1 Chill.'],
  ['Infuse', 'Pyromancer: adds Ignite. Cryomancer: adds Chill.'],
  ['Cut', "Sends a Field card to the bottom of its owner's deck."],
  ['Silenced', 'Card effects are off. Dmg still lands.'],
  ['Vulnerable', 'Takes more dmg from hits.'],
  ['Guard Crush', 'Part of your dmg goes through Block.'],
  ['True Damage', "Your dmg can't be lowered."],
  ['Mark of Assassin', 'Later Strikes on them burst for more dmg.'],
  ['Regen', 'Heals part of your missing HP at the end of every turn.'],
  ['Lifesteal', 'Heals you a share of the dmg you deal.'],
  ['Tenacity', "Charge break can't discard your slot 1 card."],
  ['Endurance', 'Tank canisters: fill when hurt, cash in when you Strike.'],
  ['Momentum', 'Juggernaut stacks: each one adds dmg to every card.'],
  ['Critical', 'Fatal Rhythm: every few attacks hits for extra dmg.'],
]

/** The keywords a rules text uses, in glossary order (whole words; "Cut" also matches "Cuts"). */
export function keywordsIn(text: string): [string, string][] {
  return KEYWORDS.filter(([k]) => new RegExp(`(^|[^A-Za-z])${k.replace(/[-]/g, '\\-')}(s|ting)?($|[^A-Za-z])`).test(text))
}
