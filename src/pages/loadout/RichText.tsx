// Readable rules text for the Path / Oath steps (Q 2026-10-29): a filled Style / Oath / Ascendancy line becomes a bullet
// list (one sentence or "\n"-separated clause each; th.ts puts "\n" where Thai has no full stops), and numbers and game
// words get a colour. Works on any language: the game words stay English inside Thai lines.
import { Fragment, type ReactNode } from 'react'
import { bullets } from './bullets'

// Longest first: "Molten Shield" before "Shield", "Charge break" before "Charge".
const KEYWORDS: [RegExp, string][] = [
  [/Molten Shield|Ignite|Combustion|Everburn|Infuse/, 'fire'],
  [/Frost Armor|Frozen Tomb|Absolute Zero|Frozen|Freeze|Chill|Shatter|Thaw/, 'ice'],
  [/Lifesteal|Lifeline|Tenacity|Shield|Parry|Veil|heals?|healing|ฮีล/, 'heal'],
  [/True Fury|Endurance|Momentum|Overdrive|Acceleration|Critical|Build-up|Rage|Mana|Energy|Vigor|Colossus Slam|Colossus|Fury|Titan Bloom|Wound Up|Payback|Undying/, 'res'],
  [/Vulnerable|knocked out|finishes them|ignores Block|can't be Blocked|Block ไม่ได้|ปิดเกม|ทะลุ Block|Cuts?|Mark(?:ed|s)?|Pierce/, 'hit'],
  [/Charge break|counter-spin|Strike|Block|Charge/, 'act'],
]
const NUM = String.raw`(?:[+−-]|[×x])?\d+(?:\.\d+)?%?\+?`
const TOKEN = new RegExp(`(?<![A-Za-z\\d{])(${NUM})(?![A-Za-z\\d])|(?<![A-Za-z])(${KEYWORDS.map(([r]) => r.source).join('|')})(?![A-Za-z])`, 'g')
const kindOf = (word: string) => KEYWORDS.find(([r]) => new RegExp(`^(?:${r.source})$`).test(word))?.[1] ?? 'res'

/** One line with its numbers and game words wrapped in coloured spans. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      m[1] ? (
        <b key={m.index} className="rt-num">
          {m[1]}
        </b>
      ) : (
        <span key={m.index} className={`rt-kw ${kindOf(m[2])}`}>
          {m[2]}
        </span>
      ),
    )
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return <>{out.map((x, i) => (typeof x === 'string' ? <Fragment key={`t${i}`}>{x}</Fragment> : x))}</>
}

/** A rules line as a bullet list (or a plain line when it is one sentence). Spans, so it can sit inside a button. */
export function RichList({ text, className = '' }: { text: string; className?: string }) {
  const list = bullets(text)
  if (list.length < 2)
    return (
      <span className={`rt-one ${className}`}>
        <Rich text={list[0] ?? ''} />
      </span>
    )
  return (
    <span className={`rt-list ${className}`} role="list">
      {list.map((b, i) => (
        <span key={i} className="rt-li" role="listitem">
          <Rich text={b} />
        </span>
      ))}
    </span>
  )
}
