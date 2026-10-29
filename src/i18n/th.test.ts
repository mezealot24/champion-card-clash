// Every English line the player screens pass to t() has a Thai line, and the Thai keeps the same {slots}.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { t, withLang } from '.'
import { CHAMP_INFO, STYLE_SUMMARY } from '../pages/select/info'
import { TUTORIAL } from '../pages/tutorial/script'
import { TIERS } from '../pages/arcade/arcade'
import { TH } from './th'
import { PRESETS } from '../pages/deck/presets'

const LIT = String.raw`(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")`
// t('…'), t(cond ? '…' : '…'), tr(…), and pl(n, '…', '…')
const CALL = new RegExp(String.raw`\b(?:t|tr)\((?:[^'"()?]*\?\s*)?` + LIT + String.raw`(?:\s*:\s*` + LIT + ')?', 'g')
const PL = new RegExp(String.raw`\bpl\([^,]+,\s*` + LIT + String.raw`,\s*` + LIT, 'g')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'i18n' ? [] : files(p)
    return /\.tsx?$/.test(f) && !f.includes('.test.') ? [p] : []
  })
}

/** English keys written as literals in t() calls across src/pages. */
function literalKeys(): string[] {
  const out = new Set<string>()
  for (const f of files(join(__dirname, '..', 'pages'))) {
    const src = readFileSync(f, 'utf8')
    for (const rx of [CALL, PL])
      for (const m of src.matchAll(rx)) for (const g of m.slice(1)) if (g) out.add(g.replace(/\\(['"])/g, '$1'))
  }
  return [...out]
}

/** Data lines shown through t(info.role) and friends. */
const dataKeys = [
  ...Object.values(CHAMP_INFO).flatMap((c) => [c.role, c.resource, c.combo, ...c.plays]),
  ...Object.values(STYLE_SUMMARY),
  ...TUTORIAL.flatMap((s) => [s.title, s.text, s.good]),
  // keys built from tables: action names and tags, step names, card types, discard reasons, loadout labels
  ...['Strike', 'Block', 'Charge', 'STRIKE', 'BLOCK', 'CHARGE', 'beats Charge', 'beats Strike', 'beats Block'],
  ...['Champion', 'Path', 'Oath', 'Deck', 'Fight', 'Punch', 'Kick', 'Skill', 'Charge break', 'Block streak', 'Minor', 'Ascendancy'],
  ...['SECOND HELPING', 'Heal 10% of your HP', 'DEATH MARK', 'Every later Strike bursts +50%', 'SEALED', "Enemy can't Block next turn", 'GUARD CRUSH', 'Next Strike breaks through Block'],
  ...['Tank pays for S cards with HP.'],
  ...TIERS.map((x) => x.name),
  // stat names (StatBars table) and preset pitches
  ...['HP', 'Defend', 'ATK', 'Technique', 'Speed'],
  ...Object.values(PRESETS).flatMap((ps) => ps.map((p) => p.pitch)),
]

const slots = (s: string) => (s.match(/\{[\w.|]+\}/g) ?? []).sort()

describe('Thai text', () => {
  const keys = [...new Set([...literalKeys(), ...dataKeys])]

  it('finds the t() calls', () => {
    expect(keys.length).toBeGreaterThan(150)
    expect(keys).toContain('Pick a Style')
  })

  it('has a Thai line for every English key', () => {
    expect(keys.filter((k) => !(k in TH))).toEqual([])
  })

  it('keeps every {slot} of the English line', () => {
    expect(Object.entries(TH).filter(([en, th]) => slots(en).join() !== slots(th).join())).toEqual([])
  })

  it('switches language and fills slots', () => {
    expect(withLang('en', () => t('{n} cards', { n: 25 }))).toBe('25 cards')
    expect(withLang('th', () => t('{n} cards', { n: 25 }))).toBe(TH['{n} cards'].replace('{n}', '25'))
    expect(withLang('th', () => t('no Thai for this line'))).toBe('no Thai for this line')
  })
})
