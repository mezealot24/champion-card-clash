import { describe, expect, it } from 'vitest'
import { bullets } from './bullets'

describe('bullets', () => {
  it('splits English sentences and "; ", keeps decimals and brackets', () => {
    expect(bullets('Lifeline red line +5%. Each time you lose 15% of your Max HP (S costs count), gain 1 Endurance (once a turn).')).toEqual([
      'Lifeline red line +5%',
      'Each time you lose 15% of your Max HP (S costs count), gain 1 Endurance (once a turn)',
    ])
    expect(bullets('Become a Colossus from +40 grown; a Colossus Slam costs 30 grown. Burns 2 HP + 0.5% Max HP')).toEqual([
      'Become a Colossus from +40 grown',
      'a Colossus Slam costs 30 grown',
      'Burns 2 HP + 0.5% Max HP',
    ])
  })
  it('splits Thai lines on "\\n"', () => {
    expect(bullets('ได้ 1 Endurance\nEndurance สูงสุด +1')).toEqual(['ได้ 1 Endurance', 'Endurance สูงสุด +1'])
  })
})
